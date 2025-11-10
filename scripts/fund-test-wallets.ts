/**
 * Fund Test Wallets with SOL Airdrop
 *
 * Request SOL airdrop for newly generated test wallets
 */

import * as anchor from "@coral-xyz/anchor";
import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

async function fundWallets() {
  const connection = new anchor.web3.Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );

  // Read keypairs
  const keysDir = path.join(__dirname, "../.keys");
  const providerPath = path.join(keysDir, "provider.json");
  const clientPath = path.join(keysDir, "client.json");

  if (!fs.existsSync(providerPath) || !fs.existsSync(clientPath)) {
    throw new Error("Please run setup-test-wallets.ts first to generate keypairs");
  }

  const providerSecretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(providerPath, "utf-8"))
  );
  const clientSecretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(clientPath, "utf-8"))
  );

  const provider = Keypair.fromSecretKey(providerSecretKey);
  const client = Keypair.fromSecretKey(clientSecretKey);

  console.log("💰 Requesting SOL airdrop...\n");
  console.log("Provider:", provider.publicKey.toString());
  console.log("Client:", client.publicKey.toString());
  console.log("");

  try {
    // Provider airdrop
    console.log("Requesting 2 SOL for Provider...");
    const providerAirdrop = await connection.requestAirdrop(
      provider.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(providerAirdrop);
    console.log("  ✅ Provider received 2 SOL");
    console.log("  TX:", providerAirdrop);
    console.log("");

    // Wait a bit to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Client airdrop
    console.log("Requesting 2 SOL for Client...");
    const clientAirdrop = await connection.requestAirdrop(
      client.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(clientAirdrop);
    console.log("  ✅ Client received 2 SOL");
    console.log("  TX:", clientAirdrop);
    console.log("");
  } catch (error: any) {
    console.log("⚠️  Airdrop may have failed (devnet rate limit)");
    console.log("   Error:", error.message);
    console.log("");
  }

  // Check balances
  console.log("📊 Checking balances...\n");

  const providerBalance = await connection.getBalance(provider.publicKey);
  const clientBalance = await connection.getBalance(client.publicKey);

  console.log("Provider SOL balance:", providerBalance / LAMPORTS_PER_SOL, "SOL");
  console.log("Client SOL balance:", clientBalance / LAMPORTS_PER_SOL, "SOL");
  console.log("");

  console.log("📋 Next steps:");
  console.log("  1. Get test tokens from faucet to Provider address");
  console.log("     Provider address:", provider.publicKey.toString());
  console.log("     Or");
  console.log("  2. If you have old address private key, create a transfer script");
  console.log("");
  console.log("🔗 Devnet USDC faucet:");
  console.log("   https://spl-token-faucet.com/?token-name=USDC");
  console.log("");
}

fundWallets()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
