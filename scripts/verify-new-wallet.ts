/**
 * Verify new Provider wallet has received funds
 */

import * as anchor from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

async function verifyWallet() {
  const connection = new anchor.web3.Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );

  // Read new Provider keypair
  const keysDir = path.join(__dirname, "../.keys");
  const providerPath = path.join(keysDir, "provider.json");

  if (!fs.existsSync(providerPath)) {
    throw new Error("Provider keypair not found");
  }

  const providerSecretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(providerPath, "utf-8"))
  );
  const provider = Keypair.fromSecretKey(providerSecretKey);

  console.log("🔍 Verifying new Provider wallet...\n");
  console.log("Provider address:", provider.publicKey.toString());
  console.log("");

  // Check SOL balance
  const solBalance = await connection.getBalance(provider.publicKey);
  console.log("💰 SOL balance:", solBalance / LAMPORTS_PER_SOL, "SOL");

  if (solBalance === 0) {
    console.log("  ⚠️  No SOL received");
  } else {
    console.log("  ✅ SOL received");
  }
  console.log("");

  // Check all token accounts
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    provider.publicKey,
    { programId: TOKEN_PROGRAM_ID }
  );

  console.log(`📊 Token account count: ${tokenAccounts.value.length}\n`);

  if (tokenAccounts.value.length === 0) {
    console.log("❌ No token accounts found");
    console.log("   Tokens may still be in transfer, please wait and try again");
    return;
  }

  let totalTokens = 0;
  for (const { pubkey, account } of tokenAccounts.value) {
    const parsedInfo = account.data.parsed.info;
    const mint = parsedInfo.mint;
    const balance = parsedInfo.tokenAmount.uiAmount;
    const decimals = parsedInfo.tokenAmount.decimals;

    console.log("Token Account:", pubkey.toString());
    console.log("  Mint:", mint);
    console.log("  Balance:", balance);
    console.log("  Decimals:", decimals);
    console.log("");

    totalTokens += balance;
  }

  console.log("═══════════════════════════════════════════════════════════");
  console.log("📋 Summary:");
  console.log("  SOL balance:", solBalance / LAMPORTS_PER_SOL, "SOL");
  console.log("  Token accounts:", tokenAccounts.value.length);
  console.log("  Total Tokens:", totalTokens);
  console.log("");

  if (solBalance >= 0.01 * LAMPORTS_PER_SOL && totalTokens >= 1.02) {
    console.log("✅ Funds sufficient, can start E2E testing!");
    console.log("");
    console.log("Run tests:");
    console.log("  ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \\");
    console.log("  ANCHOR_WALLET=~/.config/solana/id.json \\");
    console.log("  npx ts-mocha -p ./tsconfig.json -t 1000000 tests/complete-e2e-test.ts");
  } else {
    console.log("⚠️  Insufficient funds:");
    if (solBalance < 0.01 * LAMPORTS_PER_SOL) {
      console.log("  - Need more SOL (at least 0.01 SOL for gas fees)");
    }
    if (totalTokens < 1.02) {
      console.log("  - Need more tokens (at least 1.02 for bond)");
    }
  }
  console.log("═══════════════════════════════════════════════════════════");
}

verifyWallet()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
