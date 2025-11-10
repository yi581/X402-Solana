/**
 * Check all token accounts for Provider Wallet
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

async function checkAllTokens() {
  const connection = new anchor.web3.Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );

  const providerWallet = new PublicKey("7RRuzQ6ix3L6LghJr1RdWCUKT4mJhUGwhaLecZwKeAim");
  const DEVNET_USDC_MINT = new PublicKey("Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr");

  console.log("🔍 Checking all Token accounts for Provider...\n");
  console.log("Provider Wallet:", providerWallet.toString());
  console.log("");

  try {
    // Get all token accounts owned by the provider wallet
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      providerWallet,
      { programId: TOKEN_PROGRAM_ID }
    );

    console.log(`📊 Found ${tokenAccounts.value.length} Token account(s):\n`);

    if (tokenAccounts.value.length === 0) {
      console.log("❌ No Token accounts found");
      console.log("");
      console.log("💡 Tips:");
      console.log("   If you transferred USDC to this address, you may need to create Token account first");
      console.log("   Or USDC may have been transferred to a different address");
      return;
    }

    for (const { pubkey, account } of tokenAccounts.value) {
      const parsedInfo = account.data.parsed.info;
      const mint = parsedInfo.mint;
      const balance = parsedInfo.tokenAmount.uiAmount;
      const decimals = parsedInfo.tokenAmount.decimals;

      console.log("Token Account:", pubkey.toString());
      console.log("  Mint:", mint);
      console.log("  Balance:", balance);
      console.log("  Decimals:", decimals);

      if (mint === DEVNET_USDC_MINT.toString()) {
        console.log("  ✅ This is the USDC account!");
      }
      console.log("");
    }

    // Also check recent transactions
    console.log("📜 Checking recent transaction history...\n");
    const signatures = await connection.getSignaturesForAddress(
      providerWallet,
      { limit: 10 }
    );

    if (signatures.length > 0) {
      console.log(`Found ${signatures.length} recent transaction(s):\n`);
      for (const sig of signatures) {
        console.log("Signature:", sig.signature);
        console.log("  Block Time:", sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : "Unknown");
        console.log("  Status:", sig.err ? "❌ Failed" : "✅ Success");
        console.log("");
      }
    } else {
      console.log("No recent transactions found");
    }

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    throw error;
  }
}

checkAllTokens()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
