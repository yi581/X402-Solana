/**
 * Setup Test Wallets for E2E Testing
 *
 * Generate new Provider and Client keypairs and save them
 */

import * as anchor from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

async function setupWallets() {
  console.log("🔐 Generating test wallets...\n");

  // Generate new keypairs
  const provider = Keypair.generate();
  const client = Keypair.generate();

  // Create .keys directory
  const keysDir = path.join(__dirname, "../.keys");
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  // Save keypairs
  const providerPath = path.join(keysDir, "provider.json");
  const clientPath = path.join(keysDir, "client.json");

  fs.writeFileSync(
    providerPath,
    JSON.stringify(Array.from(provider.secretKey))
  );
  fs.writeFileSync(
    clientPath,
    JSON.stringify(Array.from(client.secretKey))
  );

  console.log("✅ Keypairs saved:\n");
  console.log("Provider:");
  console.log("  Public Key:", provider.publicKey.toString());
  console.log("  Keypair file:", providerPath);
  console.log("");
  console.log("Client:");
  console.log("  Public Key:", client.publicKey.toString());
  console.log("  Keypair file:", clientPath);
  console.log("");

  // Add to .gitignore
  const gitignorePath = path.join(__dirname, "../.gitignore");
  const gitignoreContent = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf-8")
    : "";

  if (!gitignoreContent.includes(".keys/")) {
    fs.appendFileSync(gitignorePath, "\n# Test keypairs\n.keys/\n");
    console.log("✅ Added .keys/ to .gitignore");
    console.log("");
  }

  console.log("📋 Next steps:");
  console.log("  1. Transfer your 10 tokens from old address to new Provider address");
  console.log("     Transfer to:", provider.publicKey.toString());
  console.log("  2. Request SOL airdrop for new addresses (for gas fees)");
  console.log("");

  return { provider, client };
}

setupWallets()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
