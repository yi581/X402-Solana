/**
 * Check USDC Balance for Provider Wallet
 */

import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { getAccount } from "@solana/spl-token";

async function checkBalance() {
  // Connect to devnet
  const connection = new anchor.web3.Connection(
    "https://api.devnet.solana.com",
    "confirmed"
  );

  // Provider wallet and token account from test
  const providerWallet = new PublicKey("7RRuzQ6ix3L6LghJr1RdWCUKT4mJhUGwhaLecZwKeAim");
  const providerTokenAccount = new PublicKey("DUDx2oqYZnHEYJfnw3j81kc8Hs4A42q6km6YaitVpaii");

  console.log("🔍 检查Provider USDC余额...\n");
  console.log("Provider Wallet:", providerWallet.toString());
  console.log("Token Account:", providerTokenAccount.toString());
  console.log("");

  try {
    // Check SOL balance
    const solBalance = await connection.getBalance(providerWallet);
    console.log("💰 SOL Balance:", solBalance / anchor.web3.LAMPORTS_PER_SOL, "SOL");

    // Check USDC balance
    const tokenAccountInfo = await getAccount(connection, providerTokenAccount);
    const usdcBalance = Number(tokenAccountInfo.amount) / 1_000_000; // USDC has 6 decimals

    console.log("💵 USDC Balance:", usdcBalance, "USDC");
    console.log("");

    if (usdcBalance >= 10) {
      console.log("✅ 确认收到 10 USDC！");
      console.log("");
      console.log("📋 下一步：Provider存入保证金到vault");
    } else {
      console.log("⚠️  USDC余额不足10");
    }

    return usdcBalance;
  } catch (error: any) {
    console.error("❌ 错误:", error.message);
    throw error;
  }
}

checkBalance()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
