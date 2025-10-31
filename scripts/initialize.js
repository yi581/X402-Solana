#!/usr/bin/env node
/**
 * X402 Insurance Protocol - Initialization Script
 *
 * This script initializes the deployed program with:
 * - Platform treasury address
 * - Platform penalty rate (default 2%)
 * - Default timeout (default 5 minutes)
 */

const anchor = require("@coral-xyz/anchor");
const { PublicKey, Keypair } = require("@solana/web3.js");
const fs = require("fs");

async function main() {
  console.log("🚀 X402 Insurance Protocol - Initialization");
  console.log("==========================================\n");

  // Load program
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const idl = JSON.parse(
    fs.readFileSync("./target/idl/x402_insurance.json", "utf8")
  );
  const programId = new PublicKey(idl.metadata.address);
  const program = new anchor.Program(idl, programId, provider);

  console.log("Program ID:", programId.toString());
  console.log("Authority:", provider.wallet.publicKey.toString());
  console.log("");

  // Get config from user
  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (query) =>
    new Promise((resolve) => readline.question(query, resolve));

  // Platform treasury
  const defaultTreasury = provider.wallet.publicKey.toString();
  let platformTreasuryStr = await question(
    `Platform Treasury address [${defaultTreasury}]: `
  );
  platformTreasuryStr = platformTreasuryStr.trim() || defaultTreasury;
  const platformTreasury = new PublicKey(platformTreasuryStr);

  // Penalty rate
  let penaltyRateStr = await question(
    "Platform penalty rate in basis points [200 = 2%]: "
  );
  const penaltyRate = parseInt(penaltyRateStr.trim() || "200");

  // Default timeout
  let timeoutStr = await question(
    "Default timeout in seconds [300 = 5 minutes]: "
  );
  const defaultTimeout = parseInt(timeoutStr.trim() || "300");

  readline.close();

  console.log("\n📋 Configuration:");
  console.log("   Platform Treasury:", platformTreasury.toString());
  console.log("   Penalty Rate:", penaltyRate, "bps (", penaltyRate / 100, "%)");
  console.log("   Default Timeout:", defaultTimeout, "seconds");
  console.log("");

  // Derive config PDA
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    programId
  );

  console.log("Config PDA:", configPDA.toString());
  console.log("");

  // Check if already initialized
  try {
    const config = await program.account.insuranceConfig.fetch(configPDA);
    console.log("⚠️  Protocol already initialized!");
    console.log("   Current Treasury:", config.platformTreasury.toString());
    console.log("   Current Penalty:", config.platformPenaltyRate, "bps");
    console.log("   Current Timeout:", config.defaultTimeout.toString(), "seconds");
    console.log("\nTo change settings, implement an update instruction.");
    process.exit(0);
  } catch (err) {
    // Not initialized yet, proceed
  }

  // Initialize
  console.log("🔧 Initializing protocol...");

  try {
    const tx = await program.methods
      .initialize(penaltyRate, new anchor.BN(defaultTimeout))
      .accounts({
        config: configPDA,
        platformTreasury: platformTreasury,
        authority: provider.wallet.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    console.log("✅ Transaction signature:", tx);
    console.log("");

    // Verify
    const config = await program.account.insuranceConfig.fetch(configPDA);
    console.log("✅ Verification:");
    console.log("   Platform Treasury:", config.platformTreasury.toString());
    console.log("   Penalty Rate:", config.platformPenaltyRate, "bps");
    console.log("   Default Timeout:", config.defaultTimeout.toString(), "seconds");
    console.log("");

    console.log("🎉 Protocol initialized successfully!");
    console.log("");
    console.log("Next steps:");
    console.log("1. Providers can deposit bonds: depositBond()");
    console.log("2. Clients can purchase insurance: purchaseInsurance()");
    console.log("3. Run tests: anchor test");
  } catch (err) {
    console.error("❌ Initialization failed:", err);
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
