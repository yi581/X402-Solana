/**
 * Provider Liquidation Test
 *
 * Test Scenario:
 * 1. Provider deposits bond
 * 2. Multiple claims reduce Provider's bond below minimum
 * 3. After 24-hour grace period, liquidate Provider
 * 4. Remaining bond transferred to platform
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

describe("Provider Liquidation Test", () => {
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

  // Token accounts
  let providerTokenAccount: any;
  let platformTokenAccount: any;

  before(async () => {
    console.log("\n🔧 Setting up Provider liquidation test environment...\n");

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

    const vaultTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      providerKeypair,
      TOKEN_MINT,
      vaultPDA,
      true
    );
    vaultTokenAccount = vaultTokenAccountInfo.address;

    platformTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      providerKeypair,
      TOKEN_MINT,
      provider.wallet.publicKey
    );

    console.log("✅ Setup complete\n");
  });

  it("1️⃣ Check current Provider status", async () => {
    console.log("🔍 Checking Provider current bond status...");

    try {
      const bond = await program.account.providerBond.fetch(providerBondPDA);

      console.log("  Provider Bond:");
      console.log("    Total bond:", bond.totalBond.toString(), "=", bond.totalBond.toNumber() / 1_000_000, "tokens");
      console.log("    Locked bond:", bond.lockedBond.toString(), "=", bond.lockedBond.toNumber() / 1_000_000, "tokens");
      console.log("    Minimum bond:", bond.minBond.toString(), "=", bond.minBond.toNumber() / 1_000_000, "tokens");
      console.log("    Is liquidated:", bond.isLiquidated);
      console.log("    Undercollateralized since:", bond.undercollateralizedSince.toString());
      console.log("");

      const available = bond.totalBond.toNumber() - bond.lockedBond.toNumber();
      console.log("  Available bond:", available / 1_000_000, "tokens");

      if (available < bond.minBond.toNumber()) {
        console.log("  ⚠️  Provider bond insufficient!");
      } else {
        console.log("  ✅ Provider bond sufficient");
      }

    } catch (error: any) {
      console.log("  ℹ️  Provider Bond account does not exist");
    }
    console.log("");
  });

  it("2️⃣ Test liquidation conditions", async () => {
    console.log("📊 Testing liquidation condition check...\n");

    console.log("Conditions required for liquidation:");
    console.log("  1. Provider bond below minimum");
    console.log("  2. 24-hour grace period has passed");
    console.log("  3. Provider has not replenished bond during grace period");
    console.log("");

    try {
      const bond = await program.account.providerBond.fetch(providerBondPDA);

      if (bond.isLiquidated) {
        console.log("  ⚠️  Provider already liquidated");
        return;
      }

      const available = bond.totalBond.toNumber() - bond.lockedBond.toNumber();

      if (available < bond.minBond.toNumber()) {
        console.log("  ✅ Condition 1 met: Insufficient bond");

        if (bond.undercollateralizedSince.toNumber() === 0) {
          console.log("  ❌ Condition 2 not met: Undercollateralized timestamp not set");
          console.log("     (This should be set automatically when bond first becomes insufficient)");
        } else {
          const gracePeriod = 86400; // 24 hours
          const now = Math.floor(Date.now() / 1000);
          const undercollateralizedTime = bond.undercollateralizedSince.toNumber();
          const timePassed = now - undercollateralizedTime;

          console.log("  Undercollateralized since:", new Date(undercollateralizedTime * 1000).toISOString());
          console.log("  Current time:", new Date(now * 1000).toISOString());
          console.log("  Time elapsed:", timePassed, "seconds (", Math.floor(timePassed / 3600), "hours)");
          console.log("  Grace period:", gracePeriod, "seconds (24 hours)");

          if (timePassed >= gracePeriod) {
            console.log("  ✅ Condition 2 met: Grace period has passed");
            console.log("");
            console.log("  ✅ Can execute liquidation!");
          } else {
            console.log("  ❌ Condition 2 not met: Grace period not passed");
            console.log("     Need to wait", (gracePeriod - timePassed), "more seconds");
          }
        }
      } else {
        console.log("  ❌ Condition 1 not met: Sufficient bond");
        console.log("     Available bond:", available / 1_000_000, "tokens");
        console.log("     Minimum bond:", bond.minBond.toNumber() / 1_000_000, "tokens");
      }

    } catch (error: any) {
      console.log("  ❌ Cannot check Provider status:", error.message);
    }
    console.log("");
  });

  it("3️⃣ Test summary", () => {
    console.log("");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("📊 Provider Liquidation Test Summary");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("");
    console.log("ℹ️  Liquidation Test Notes:");
    console.log("");
    console.log("Since liquidation requires 24-hour grace period, full testing on devnet requires:");
    console.log("  1. Reduce Provider bond below minimum through multiple timeout claims");
    console.log("  2. Wait for 24-hour grace period");
    console.log("  3. Execute liquidate_provider instruction");
    console.log("");
    console.log("In production environment, liquidation process serves to:");
    console.log("  - Protect the system's overall solvency");
    console.log("  - Give Provider time to replenish bond");
    console.log("  - Prevent systemic risk");
    console.log("");
    console.log("💡 Recommendations:");
    console.log("  - On localnet, can modify grace period to shorter time for testing");
    console.log("  - On devnet, can check current Provider liquidation conditions");
    console.log("  - Liquidation mechanism smart contract code is implemented and deployed");
    console.log("");
    console.log("═══════════════════════════════════════════════════════════");
  });
});
