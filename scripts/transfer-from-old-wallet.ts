/**
 * Transfer tokens from old wallet to new Provider wallet
 *
 * Usage:
 * export OLD_WALLET_KEYPAIR='[1,2,3,...]'  # Old wallet private key array
 * npx ts-node scripts/transfer-from-old-wallet.ts
 */

import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  getOrCreateAssociatedTokenAccount,
  transfer,
  getAccount,
} from "@solana/spl-token";
import * as fs from "fs";
import * as path from "path";

async function transferTokens() {
  const connection = new anchor.web3.Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );

  // Token mint
  const TOKEN_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

  // Read new Provider keypair
  const keysDir = path.join(__dirname, "../.keys");
  const newProviderPath = path.join(keysDir, "provider.json");

  if (!fs.existsSync(newProviderPath)) {
    throw new Error("Please run setup-test-wallets.ts first to generate new keypairs");
  }

  const newProviderSecretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(newProviderPath, "utf-8"))
  );
  const newProvider = Keypair.fromSecretKey(newProviderSecretKey);

  console.log("🔄 Preparing to transfer tokens to new Provider wallet...\n");
  console.log("New Provider address:", newProvider.publicKey.toString());
  console.log("");

  // Check for old wallet private key in environment variable
  const oldWalletKeypairEnv = process.env.OLD_WALLET_KEYPAIR;

  if (!oldWalletKeypairEnv) {
    console.log("❌ Error: Old wallet private key not found");
    console.log("");
    console.log("Usage:");
    console.log('  export OLD_WALLET_KEYPAIR=\'[1,2,3,...]\'  # Private key array');
    console.log("  npx ts-node scripts/transfer-from-old-wallet.ts");
    console.log("");
    console.log("Or set OLD_WALLET_KEYPAIR directly in the script");
    console.log("");
    console.log("Old Provider address: 7RRuzQ6ix3L6LghJr1RdWCUKT4mJhUGwhaLecZwKeAim");
    process.exit(1);
  }

  try {
    const oldWalletSecretKey = Uint8Array.from(JSON.parse(oldWalletKeypairEnv));
    const oldWallet = Keypair.fromSecretKey(oldWalletSecretKey);

    console.log("Old wallet address:", oldWallet.publicKey.toString());
    console.log("");

    // Get old wallet's token account
    const oldTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      oldWallet,
      TOKEN_MINT,
      oldWallet.publicKey
    );

    console.log("Old wallet Token account:", oldTokenAccount.address.toString());

    const oldBalance = Number(oldTokenAccount.amount) / 1_000_000;
    console.log("Old wallet balance:", oldBalance, "tokens");
    console.log("");

    if (oldBalance === 0) {
      console.log("❌ Old wallet balance is 0, cannot transfer");
      process.exit(1);
    }

    // Get or create new Provider's token account
    console.log("Creating new Provider's token account...");
    const newTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      oldWallet, // Use old wallet to pay for account creation
      TOKEN_MINT,
      newProvider.publicKey
    );

    console.log("New Provider Token account:", newTokenAccount.address.toString());
    console.log("");

    // Transfer all tokens
    const transferAmount = oldTokenAccount.amount;
    console.log(`Transferring ${oldBalance} tokens...`);

    const signature = await transfer(
      connection,
      oldWallet,
      oldTokenAccount.address,
      newTokenAccount.address,
      oldWallet.publicKey,
      transferAmount
    );

    console.log("✅ Transfer successful!");
    console.log("TX:", signature);
    console.log("");

    // Verify balance
    const newAccountInfo = await getAccount(connection, newTokenAccount.address);
    const newBalance = Number(newAccountInfo.amount) / 1_000_000;

    console.log("📊 Post-transfer balances:");
    console.log("  New Provider:", newBalance, "tokens");
    console.log("");

    console.log("✅ Complete! You can now run the full E2E tests");

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    throw error;
  }
}

transferTokens()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
