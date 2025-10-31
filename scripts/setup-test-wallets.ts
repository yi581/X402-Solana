/**
 * Setup Test Wallets for E2E Testing
 *
 * 生成新的Provider和Client keypairs并保存
 */

import * as anchor from "@coral-xyz/anchor";
import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

async function setupWallets() {
  console.log("🔐 生成测试钱包...\n");

  // 生成新的keypairs
  const provider = Keypair.generate();
  const client = Keypair.generate();

  // 创建.keys目录
  const keysDir = path.join(__dirname, "../.keys");
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  // 保存keypairs
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

  console.log("✅ Keypairs已保存:\n");
  console.log("Provider:");
  console.log("  Public Key:", provider.publicKey.toString());
  console.log("  Keypair文件:", providerPath);
  console.log("");
  console.log("Client:");
  console.log("  Public Key:", client.publicKey.toString());
  console.log("  Keypair文件:", clientPath);
  console.log("");

  // 添加到.gitignore
  const gitignorePath = path.join(__dirname, "../.gitignore");
  const gitignoreContent = fs.existsSync(gitignorePath)
    ? fs.readFileSync(gitignorePath, "utf-8")
    : "";

  if (!gitignoreContent.includes(".keys/")) {
    fs.appendFileSync(gitignorePath, "\n# Test keypairs\n.keys/\n");
    console.log("✅ 已添加.keys/到.gitignore");
    console.log("");
  }

  console.log("📋 下一步:");
  console.log("  1. 请将您的10 tokens从旧地址转移到新Provider地址");
  console.log("     转账到:", provider.publicKey.toString());
  console.log("  2. 为新地址申请SOL空投（用于gas费）");
  console.log("");

  return { provider, client };
}

setupWallets()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
