/**
 * Timeout Claim Test: Client claims insurance after Provider timeout
 *
 * Test Scenario:
 * 1. Provider deposits bond
 * 2. Client purchases insurance and pays via 402
 * 3. Provider does not confirm service within timeout period
 * 4. Client initiates claim
 * 5. Client receives 1 token compensation from vault
 * 6. Platform receives 0.02 token penalty from Provider bond
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { X402Insurance } from "../target/types/x402_insurance";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

describe("Timeout Claim Test", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.X402Insurance as Program<X402Insurance>;

  // Token mint
  const TOKEN_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

  // Test keypairs
  let providerKeypair: Keypair;
  let clientKeypair: Keypair;

  // PDAs
  let configPDA: PublicKey;
  let vaultPDA: PublicKey;
  let vaultTokenAccount: PublicKey;
  let providerBondPDA: PublicKey;
  let claimPDA: PublicKey;

  // Token accounts
  let providerTokenAccount: any;
  let clientTokenAccount: any;
  let platformTokenAccount: any;

  const BOND_AMOUNT = new anchor.BN(1_020_000); // 1.02 tokens
  const PAYMENT_AMOUNT = new anchor.BN(1_000_000); // 1 token
  const TIMEOUT_MINUTES = new anchor.BN(0); // 0 minutes = immediate timeout (for testing)

  let requestCommitment: number[];

  before(async () => {
    console.log("\n🔧 Setting up timeout claim test environment...\n");

    // Read keypairs
    const keysDir = path.join(__dirname, "../.keys");
    const providerPath = path.join(keysDir, "provider.json");
    const clientPath = path.join(keysDir, "client.json");

    const providerSecretKey = Uint8Array.from(
      JSON.parse(fs.readFileSync(providerPath, "utf-8"))
    );
    const clientSecretKey = Uint8Array.from(
      JSON.parse(fs.readFileSync(clientPath, "utf-8"))
    );

    providerKeypair = Keypair.fromSecretKey(providerSecretKey);
    clientKeypair = Keypair.fromSecretKey(clientSecretKey);

    console.log("📋 Test Accounts:");
    console.log("  Platform:", provider.wallet.publicKey.toString());
    console.log("  Provider:", providerKeypair.publicKey.toString());
    console.log("  Client:", clientKeypair.publicKey.toString());
    console.log("");

    // Derive PDAs
    [configPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    );

    [providerBondPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("provider_bond"), providerKeypair.publicKey.toBuffer()],
      program.programId
    );

    // Get token accounts
    providerTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      providerKeypair,
      TOKEN_MINT,
      providerKeypair.publicKey
    );

    clientTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      providerKeypair,
      TOKEN_MINT,
      clientKeypair.publicKey
    );

    // Vault is a PDA-derived token account, NOT an associated token account
    // It's created with seeds [b"vault"] in the deposit_bond instruction
    // So we just pass the vaultPDA directly (which IS the token account)
    vaultTokenAccount = vaultPDA;

    // Platform token account
    platformTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      providerKeypair,
      TOKEN_MINT,
      provider.wallet.publicKey
    );

    console.log("✅ Setup complete\n");
  });

  it("1️⃣ Client purchases insurance and pays (Provider will timeout)", async () => {
    console.log("💳 Client purchasing insurance and paying...");

    // First check if Client has SOL for gas fees and account creation
    const clientSolBalance = await provider.connection.getBalance(clientKeypair.publicKey);
    if (clientSolBalance < 0.01 * LAMPORTS_PER_SOL) {
      console.log("  Transferring 0.01 SOL to Client from Provider...");
      const transferTx = await provider.connection.sendTransaction(
        new anchor.web3.Transaction().add(
          anchor.web3.SystemProgram.transfer({
            fromPubkey: providerKeypair.publicKey,
            toPubkey: clientKeypair.publicKey,
            lamports: 0.01 * LAMPORTS_PER_SOL,
          })
        ),
        [providerKeypair]
      );
      await provider.connection.confirmTransaction(transferTx);
    }

    // Ensure Client has tokens
    const clientBalance = Number(clientTokenAccount.amount);
    if (clientBalance === 0) {
      console.log("  Transferring 1 token to Client from Provider...");
      const { transfer } = await import("@solana/spl-token");
      await transfer(
        provider.connection,
        providerKeypair,
        providerTokenAccount.address,
        clientTokenAccount.address,
        providerKeypair.publicKey,
        PAYMENT_AMOUNT.toNumber()
      );
    }

    // Generate request commitment
    requestCommitment = Array.from(crypto.getRandomValues(new Uint8Array(32)));

    [claimPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("claim"), Buffer.from(requestCommitment)],
      program.programId
    );

    console.log("  Claim PDA:", claimPDA.toString());

    const tx = await program.methods
      .purchaseInsurance(requestCommitment, PAYMENT_AMOUNT, TIMEOUT_MINUTES)
      .accounts({
        claim: claimPDA,
        config: configPDA,
        providerBond: providerBondPDA,
        client: clientKeypair.publicKey,
        provider: providerKeypair.publicKey,
        clientTokenAccount: clientTokenAccount.address,
        providerTokenAccount: providerTokenAccount.address,
        vault: vaultPDA,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([clientKeypair])
      .rpc();

    console.log("  ✅ Purchase successful, TX:", tx);

    const claim = await program.account.insuranceClaim.fetch(claimPDA);
    console.log("  Payment amount:", claim.paymentAmount.toString());
    console.log("  Locked amount:", claim.lockedAmount.toString());
    console.log("  Deadline:", new Date(claim.deadline.toNumber() * 1000).toISOString());
    console.log("");
  });

  it("2️⃣ Wait for timeout", async () => {
    console.log("⏰ Waiting for timeout...");

    const claim = await program.account.insuranceClaim.fetch(claimPDA);
    const deadline = claim.deadline.toNumber();
    const now = Math.floor(Date.now() / 1000);

    console.log("  Current time:", new Date(now * 1000).toISOString());
    console.log("  Deadline:", new Date(deadline * 1000).toISOString());

    if (now < deadline) {
      const waitTime = (deadline - now + 1) * 1000;
      console.log(`  Need to wait ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      console.log("  ✅ Timed out");
    } else {
      console.log("  ✅ Already timed out");
    }
    console.log("");
  });

  it("3️⃣ Client initiates claim", async () => {
    console.log("🔔 Client initiating insurance claim...");

    // Record balances before claim
    const clientBalanceBefore = await getAccount(
      provider.connection,
      clientTokenAccount.address
    );
    const platformBalanceBefore = await getAccount(
      provider.connection,
      platformTokenAccount.address
    );
    const providerBondBefore = await program.account.providerBond.fetch(
      providerBondPDA
    );

    console.log("  Before claim:");
    console.log("    Client balance:", Number(clientBalanceBefore.amount) / 1_000_000);
    console.log("    Platform balance:", Number(platformBalanceBefore.amount) / 1_000_000);
    console.log("    Provider total bond:", providerBondBefore.totalBond.toString());
    console.log("");

    try {
      const tx = await program.methods
        .claimInsurance(requestCommitment)
        .accounts({
          claim: claimPDA,
          config: configPDA,
          providerBond: providerBondPDA,
          client: clientKeypair.publicKey,
          clientTokenAccount: clientTokenAccount.address,
          platformTreasuryTokenAccount: platformTokenAccount.address,
          vault: vaultTokenAccount, // This is the vault token account derived with seeds [b"vault"]
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([clientKeypair])
        .rpc();

      console.log("  ✅ Claim successful!");
      console.log("  TX:", tx);
      console.log("");

      // Verify balances after claim
      const clientBalanceAfter = await getAccount(
        provider.connection,
        clientTokenAccount.address
      );
      const platformBalanceAfter = await getAccount(
        provider.connection,
        platformTokenAccount.address
      );
      const providerBondAfter = await program.account.providerBond.fetch(
        providerBondPDA
      );
      const claim = await program.account.insuranceClaim.fetch(claimPDA);

      console.log("  After claim:");
      console.log("    Client balance:", Number(clientBalanceAfter.amount) / 1_000_000);
      console.log("    Platform balance:", Number(platformBalanceAfter.amount) / 1_000_000);
      console.log("    Provider total bond:", providerBondAfter.totalBond.toString());
      console.log("");

      console.log("  📊 Verification results:");
      const clientGain = Number(clientBalanceAfter.amount) - Number(clientBalanceBefore.amount);
      const platformGain = Number(platformBalanceAfter.amount) - Number(platformBalanceBefore.amount);
      const bondLoss = providerBondBefore.totalBond.toNumber() - providerBondAfter.totalBond.toNumber();

      console.log("    Client received:", clientGain / 1_000_000, "tokens (should be 1)");
      console.log("    Platform received:", platformGain / 1_000_000, "tokens (should be 0.02)");
      console.log("    Provider deducted:", bondLoss / 1_000_000, "tokens (should be 1.02)");
      console.log("    Claim status:", Object.keys(claim.status)[0]);

      // Assertions
      assert(clientGain === 1_000_000, "Client should receive 1 token compensation");
      assert(platformGain === 20_000, "Platform should receive 0.02 token penalty");
      assert(bondLoss === 1_020_000, "Provider bond should be deducted 1.02 tokens");
      assert(claim.status.hasOwnProperty("claimed"), "Claim status should be claimed");

      console.log("");
      console.log("  ✅ All verifications passed!");

    } catch (error: any) {
      console.error("  ❌ Claim failed:", error);
      throw error;
    }
  });

  it("4️⃣ Test summary", () => {
    console.log("");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("🎉 Timeout Claim Test Complete!");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("");
    console.log("✅ Verified features:");
    console.log("  1. ✅ Client purchases insurance and pays Provider");
    console.log("  2. ✅ Provider times out without confirming service");
    console.log("  3. ✅ Client successfully initiates claim");
    console.log("  4. ✅ Client receives 1 token compensation from vault");
    console.log("  5. ✅ Platform receives 0.02 token penalty");
    console.log("  6. ✅ Provider bond correctly deducted 1.02 tokens");
    console.log("");
    console.log("📝 This proves the insurance mechanism protects Clients from Provider service failure!");
    console.log("═══════════════════════════════════════════════════════════");
  });
});
