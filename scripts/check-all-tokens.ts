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

  console.log("🔍 检查Provider的所有Token账户...\n");
  console.log("Provider Wallet:", providerWallet.toString());
  console.log("");

  try {
    // Get all token accounts owned by the provider wallet
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      providerWallet,
      { programId: TOKEN_PROGRAM_ID }
    );

    console.log(`📊 找到 ${tokenAccounts.value.length} 个Token账户:\n`);

    if (tokenAccounts.value.length === 0) {
      console.log("❌ 没有找到任何Token账户");
      console.log("");
      console.log("💡 提示：");
      console.log("   如果您将USDC转到了这个地址，可能需要先创建Token账户");
      console.log("   或者USDC可能转到了其他地址");
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
        console.log("  ✅ 这是USDC账户！");
      }
      console.log("");
    }

    // Also check recent transactions
    console.log("📜 检查最近的交易记录...\n");
    const signatures = await connection.getSignaturesForAddress(
      providerWallet,
      { limit: 10 }
    );

    if (signatures.length > 0) {
      console.log(`找到 ${signatures.length} 笔最近的交易:\n`);
      for (const sig of signatures) {
        console.log("Signature:", sig.signature);
        console.log("  Block Time:", sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : "Unknown");
        console.log("  Status:", sig.err ? "❌ Failed" : "✅ Success");
        console.log("");
      }
    } else {
      console.log("没有找到最近的交易");
    }

  } catch (error: any) {
    console.error("❌ 错误:", error.message);
    throw error;
  }
}

checkAllTokens()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
