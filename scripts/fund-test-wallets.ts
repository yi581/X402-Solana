/**
 * Fund Test Wallets with SOL Airdrop
 *
 * 为新生成的测试钱包申请SOL空投
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

  // 读取keypairs
  const keysDir = path.join(__dirname, "../.keys");
  const providerPath = path.join(keysDir, "provider.json");
  const clientPath = path.join(keysDir, "client.json");

  if (!fs.existsSync(providerPath) || !fs.existsSync(clientPath)) {
    throw new Error("请先运行 setup-test-wallets.ts 生成keypairs");
  }

  const providerSecretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(providerPath, "utf-8"))
  );
  const clientSecretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(clientPath, "utf-8"))
  );

  const provider = Keypair.fromSecretKey(providerSecretKey);
  const client = Keypair.fromSecretKey(clientSecretKey);

  console.log("💰 申请SOL空投...\n");
  console.log("Provider:", provider.publicKey.toString());
  console.log("Client:", client.publicKey.toString());
  console.log("");

  try {
    // Provider空投
    console.log("正在为Provider申请2 SOL...");
    const providerAirdrop = await connection.requestAirdrop(
      provider.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(providerAirdrop);
    console.log("  ✅ Provider获得2 SOL");
    console.log("  TX:", providerAirdrop);
    console.log("");

    // 等待一下避免限流
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Client空投
    console.log("正在为Client申请2 SOL...");
    const clientAirdrop = await connection.requestAirdrop(
      client.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(clientAirdrop);
    console.log("  ✅ Client获得2 SOL");
    console.log("  TX:", clientAirdrop);
    console.log("");
  } catch (error: any) {
    console.log("⚠️  空投可能失败（devnet限流）");
    console.log("   错误:", error.message);
    console.log("");
  }

  // 检查余额
  console.log("📊 检查余额...\n");

  const providerBalance = await connection.getBalance(provider.publicKey);
  const clientBalance = await connection.getBalance(client.publicKey);

  console.log("Provider SOL余额:", providerBalance / LAMPORTS_PER_SOL, "SOL");
  console.log("Client SOL余额:", clientBalance / LAMPORTS_PER_SOL, "SOL");
  console.log("");

  console.log("📋 下一步:");
  console.log("  1. 从水龙头获取测试tokens到Provider地址");
  console.log("     Provider地址:", provider.publicKey.toString());
  console.log("     或者");
  console.log("  2. 如果您有旧地址的私钥，可以创建转账脚本");
  console.log("");
  console.log("🔗 Devnet USDC水龙头:");
  console.log("   https://spl-token-faucet.com/?token-name=USDC");
  console.log("");
}

fundWallets()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
