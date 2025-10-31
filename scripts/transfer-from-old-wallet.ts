/**
 * Transfer tokens from old wallet to new Provider wallet
 *
 * 使用方式：
 * export OLD_WALLET_KEYPAIR='[1,2,3,...]'  # 旧钱包的私钥数组
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

  // 读取新Provider keypair
  const keysDir = path.join(__dirname, "../.keys");
  const newProviderPath = path.join(keysDir, "provider.json");

  if (!fs.existsSync(newProviderPath)) {
    throw new Error("请先运行 setup-test-wallets.ts 生成新keypairs");
  }

  const newProviderSecretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(newProviderPath, "utf-8"))
  );
  const newProvider = Keypair.fromSecretKey(newProviderSecretKey);

  console.log("🔄 准备转账tokens到新Provider钱包...\n");
  console.log("新Provider地址:", newProvider.publicKey.toString());
  console.log("");

  // 检查环境变量中的旧钱包私钥
  const oldWalletKeypairEnv = process.env.OLD_WALLET_KEYPAIR;

  if (!oldWalletKeypairEnv) {
    console.log("❌ 错误：未找到旧钱包私钥");
    console.log("");
    console.log("使用方式：");
    console.log('  export OLD_WALLET_KEYPAIR=\'[1,2,3,...]\'  # 私钥数组');
    console.log("  npx ts-node scripts/transfer-from-old-wallet.ts");
    console.log("");
    console.log("或者直接在脚本中设置 OLD_WALLET_KEYPAIR");
    console.log("");
    console.log("旧Provider地址: 7RRuzQ6ix3L6LghJr1RdWCUKT4mJhUGwhaLecZwKeAim");
    process.exit(1);
  }

  try {
    const oldWalletSecretKey = Uint8Array.from(JSON.parse(oldWalletKeypairEnv));
    const oldWallet = Keypair.fromSecretKey(oldWalletSecretKey);

    console.log("旧钱包地址:", oldWallet.publicKey.toString());
    console.log("");

    // 获取旧钱包的token账户
    const oldTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      oldWallet,
      TOKEN_MINT,
      oldWallet.publicKey
    );

    console.log("旧钱包Token账户:", oldTokenAccount.address.toString());

    const oldBalance = Number(oldTokenAccount.amount) / 1_000_000;
    console.log("旧钱包余额:", oldBalance, "tokens");
    console.log("");

    if (oldBalance === 0) {
      console.log("❌ 旧钱包余额为0，无法转账");
      process.exit(1);
    }

    // 获取或创建新Provider的token账户
    console.log("创建新Provider的token账户...");
    const newTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      oldWallet, // 用旧钱包支付创建账户的费用
      TOKEN_MINT,
      newProvider.publicKey
    );

    console.log("新Provider Token账户:", newTokenAccount.address.toString());
    console.log("");

    // 转账所有tokens
    const transferAmount = oldTokenAccount.amount;
    console.log(`正在转账 ${oldBalance} tokens...`);

    const signature = await transfer(
      connection,
      oldWallet,
      oldTokenAccount.address,
      newTokenAccount.address,
      oldWallet.publicKey,
      transferAmount
    );

    console.log("✅ 转账成功！");
    console.log("TX:", signature);
    console.log("");

    // 验证余额
    const newAccountInfo = await getAccount(connection, newTokenAccount.address);
    const newBalance = Number(newAccountInfo.amount) / 1_000_000;

    console.log("📊 转账后余额:");
    console.log("  新Provider:", newBalance, "tokens");
    console.log("");

    console.log("✅ 完成！现在可以运行完整的E2E测试了");

  } catch (error: any) {
    console.error("❌ 错误:", error.message);
    throw error;
  }
}

transferTokens()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
