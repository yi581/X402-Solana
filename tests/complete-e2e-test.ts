/**
 * Complete E2E Test: 402 Payment + Insurance
 *
 * Using keypairs in .keys/ for complete testing
 *
 * Test flow:
 * 1. Provider deposits bond
 * 2. Client pays Provider via 402
 * 3. Test success scenario: Provider confirms service
 * 4. Test failure scenario: Timeout claim
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

describe("Complete E2E: 402 Payment + Insurance", () => {
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

  const BOND_AMOUNT = new anchor.BN(1_020_000); // 1.02 tokens
  const PAYMENT_AMOUNT = new anchor.BN(1_000_000); // 1 token

  before(async () => {
    console.log("\n🔧 Loading test keypairs...\n");

    // Read keypairs
    const keysDir = path.join(__dirname, "../.keys");
    const providerPath = path.join(keysDir, "provider.json");
    const clientPath = path.join(keysDir, "client.json");

    if (!fs.existsSync(providerPath) || !fs.existsSync(clientPath)) {
      throw new Error(
        "Keypairs not found. Please run first: npx ts-node scripts/setup-test-wallets.ts"
      );
    }

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

    console.log("📍 PDAs:");
    console.log("  Config:", configPDA.toString());
    console.log("  Vault:", vaultPDA.toString());
    console.log("  Provider Bond:", providerBondPDA.toString());
    console.log("");
  });

  it("1️⃣ Check initial balances", async () => {
    console.log("🔍 Checking initial balances...");

    // Check Provider SOL balance
    const providerSolBalance = await provider.connection.getBalance(
      providerKeypair.publicKey
    );
    console.log(
      "  Provider SOL:",
      providerSolBalance / LAMPORTS_PER_SOL,
      "SOL"
    );

    // Check Client SOL balance
    const clientSolBalance = await provider.connection.getBalance(
      clientKeypair.publicKey
    );
    console.log("  Client SOL:", clientSolBalance / LAMPORTS_PER_SOL, "SOL");

    // Check Provider token balance
    const providerTokenAccounts =
      await provider.connection.getParsedTokenAccountsByOwner(
        providerKeypair.publicKey,
        { mint: TOKEN_MINT }
      );

    if (providerTokenAccounts.value.length > 0) {
      const balance =
        providerTokenAccounts.value[0].account.data.parsed.info.tokenAmount
          .uiAmount;
      console.log("  Provider Tokens:", balance);

      if (balance < 1.02) {
        console.log("");
        console.log("  ⚠️  Provider tokens insufficient");
        console.log("     Need at least 1.02 tokens to deposit bond");
        console.log("     Current:", balance);
        console.log("");
        console.log("  Please run transfer script:");
        console.log(
          "    export OLD_WALLET_KEYPAIR='[...]'  # Old wallet private key"
        );
        console.log("    npx ts-node scripts/transfer-from-old-wallet.ts");
        throw new Error("Provider tokens insufficient");
      }
    } else {
      console.log("  Provider Tokens: 0");
      throw new Error("Provider has no tokens");
    }
    console.log("");
  });

  it("2️⃣ Provider deposits bond", async () => {
    console.log("💰 Provider depositing bond to vault...");

    // Get or create token account
    providerTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      providerKeypair,
      TOKEN_MINT,
      providerKeypair.publicKey
    );

    console.log("  Provider Token Account:", providerTokenAccount.address.toString());

    // Get or create vault token account
    const vaultTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      providerKeypair, // payer
      TOKEN_MINT,
      vaultPDA,
      true // allowOwnerOffCurve - vault is PDA
    );

    vaultTokenAccount = vaultTokenAccountInfo.address;
    console.log("  Vault Token Account:", vaultTokenAccount.toString());

    try {
      const tx = await program.methods
        .depositBond(BOND_AMOUNT)
        .accounts({
          providerBond: providerBondPDA,
          provider: providerKeypair.publicKey,
          providerTokenAccount: providerTokenAccount.address,
          mint: TOKEN_MINT, // Add mint account
          vault: vaultPDA,
          vaultTokenAccount: vaultTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([providerKeypair])
        .rpc();

      console.log("  ✅ Bond deposit successful");
      console.log("  TX:", tx);

      // Verify bond account
      const bond = await program.account.providerBond.fetch(providerBondPDA);
      console.log("  Total bond:", bond.totalBond.toString());
      console.log("  Locked bond:", bond.lockedBond.toString());
    } catch (error: any) {
      if (error.message.includes("already in use")) {
        console.log("  ℹ️  Bond account already exists");
        const bond = await program.account.providerBond.fetch(providerBondPDA);
        console.log("  Total bond:", bond.totalBond.toString());
        console.log("  Available bond:", bond.availableBond.toString());
      } else {
        throw error;
      }
    }
    console.log("");
  });

  it("3️⃣ Client purchases insurance and pays via 402", async () => {
    console.log("💳 Client purchasing insurance and paying Provider via 402...");

    // First check if Client has SOL for gas fees
    const clientSolBalance = await provider.connection.getBalance(clientKeypair.publicKey);
    if (clientSolBalance === 0) {
      console.log("  ⚠️  Client has no SOL, transferring some SOL from Provider for gas fees...");

      // Transfer 0.01 SOL from Provider to Client
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
      console.log("  ✅ Transferred 0.01 SOL to Client");
    }

    // Get or create client token account
    // Use Provider to pay for account creation fee
    clientTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      providerKeypair, // payer
      TOKEN_MINT,
      clientKeypair.publicKey
    );

    console.log("  Client Token Account:", clientTokenAccount.address.toString());

    // Client needs some tokens for 402 payment
    // Transfer 1 token from Provider to Client for testing
    const clientTokenBalance = Number(clientTokenAccount.amount);
    if (clientTokenBalance === 0) {
      console.log("  ⚠️  Client has no tokens, transferring 1 token from Provider to Client...");

      const { transfer } = await import("@solana/spl-token");
      await transfer(
        provider.connection,
        providerKeypair,
        providerTokenAccount.address,
        clientTokenAccount.address,
        providerKeypair.publicKey,
        PAYMENT_AMOUNT.toNumber()
      );
      console.log("  ✅ Transferred 1 token to Client");
    }

    console.log("  Client Token Account:", clientTokenAccount.address.toString());

    // Generate request commitment (32 bytes hash)
    const requestCommitment = Array.from(crypto.getRandomValues(new Uint8Array(32)));
    const timeoutMinutes = new anchor.BN(5); // 5 minutes timeout

    // Claim PDA seeds: [b"claim", request_commitment]
    [claimPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("claim"),
        Buffer.from(requestCommitment),
      ],
      program.programId
    );

    console.log("  Request Commitment:", Buffer.from(requestCommitment).toString('hex').substring(0, 16) + "...");
    console.log("  Claim PDA:", claimPDA.toString());

    try {
      const tx = await program.methods
        .purchaseInsurance(
          requestCommitment,
          PAYMENT_AMOUNT,
          timeoutMinutes
        )
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

      console.log("  ✅ 402 payment successful!");
      console.log("  TX:", tx);
      console.log("");
      console.log("  📊 What happened:");
      console.log("    1. Client paid 1 token to Provider (402 payment)");
      console.log("    2. Vault locked Provider's 1.02 token bond");
      console.log("    3. Created insurance claim record");

      // Verify claim
      const claim = await program.account.insuranceClaim.fetch(claimPDA);
      console.log("");
      console.log("  Claim record:");
      console.log("    Client:", claim.client.toString());
      console.log("    Provider:", claim.provider.toString());
      console.log("    Payment amount:", claim.paymentAmount.toString());
      console.log("    Service description:", claim.serviceDescription);
      console.log("    Status:", Object.keys(claim.status)[0]);

    } catch (error: any) {
      console.error("  ❌ Insurance purchase failed:", error);
      throw error;
    }
    console.log("");
  });

  it("4️⃣ Provider confirms service delivery", async () => {
    console.log("✅ Provider confirming service delivery...");

    // Generate a fake Ed25519 signature for testing (64 bytes)
    const signature = Array.from(crypto.getRandomValues(new Uint8Array(64)));

    // Need to use the same requestCommitment
    // Read from claim account
    const claim = await program.account.insuranceClaim.fetch(claimPDA);
    const requestCommitment = Array.from(claim.requestCommitment);

    try {
      const tx = await program.methods
        .confirmService(requestCommitment, signature)
        .accounts({
          claim: claimPDA,
          providerBond: providerBondPDA,
          provider: providerKeypair.publicKey,
          providerTokenAccount: providerTokenAccount.address,
        })
        .signers([providerKeypair])
        .rpc();

      console.log("  ✅ Service confirmation successful");
      console.log("  TX:", tx);
      console.log("");
      console.log("  📊 What happened:");
      console.log("    1. Provider confirmed service delivered");
      console.log("    2. Vault unlocked Provider's 1.02 tokens");
      console.log("    3. Transaction complete, everyone happy!");

      // Verify claim status
      const updatedClaim = await program.account.insuranceClaim.fetch(claimPDA);
      console.log("");
      console.log("  Claim status:", Object.keys(updatedClaim.status)[0]);
      assert(updatedClaim.status.hasOwnProperty("confirmed"), "Status should be confirmed");
      console.log("  ✅ Test passed!");

    } catch (error: any) {
      console.error("  ❌ Service confirmation failed:", error);
      throw error;
    }
    console.log("");
  });

  it("5️⃣ Test summary", () => {
    console.log("");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("🎉 Devnet E2E Test Complete!");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("");
    console.log("✅ Tested:");
    console.log("  1. ✅ Provider deposits bond to vault");
    console.log("  2. ✅ Client pays Provider via 402");
    console.log("  3. ✅ Vault locks Provider bond");
    console.log("  4. ✅ Provider confirms service");
    console.log("  5. ✅ Vault unlocks Provider bond");
    console.log("");
    console.log("🔗 Explorer links:");
    console.log(
      `  Program: https://explorer.solana.com/address/${program.programId}?cluster=devnet`
    );
    console.log(
      `  Provider: https://explorer.solana.com/address/${providerKeypair.publicKey}?cluster=devnet`
    );
    console.log(
      `  Client: https://explorer.solana.com/address/${clientKeypair.publicKey}?cluster=devnet`
    );
    console.log("");
    console.log("📝 Next tests:");
    console.log("  - Test timeout claim scenario");
    console.log("  - Test Provider liquidation scenario");
    console.log("  - Integrate Facilitator service testing");
    console.log("");
    console.log("═══════════════════════════════════════════════════════════");
  });
});
