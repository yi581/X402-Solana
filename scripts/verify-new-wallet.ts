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

  // 读取新Provider keypair
  const keysDir = path.join(__dirname, "../.keys");
  const providerPath = path.join(keysDir, "provider.json");

  if (!fs.existsSync(providerPath)) {
    throw new Error("Provider keypair未找到");
  }

  const providerSecretKey = Uint8Array.from(
    JSON.parse(fs.readFileSync(providerPath, "utf-8"))
  );
  const provider = Keypair.fromSecretKey(providerSecretKey);

  console.log("🔍 验证新Provider钱包...\n");
  console.log("Provider地址:", provider.publicKey.toString());
  console.log("");

  // 检查SOL余额
  const solBalance = await connection.getBalance(provider.publicKey);
  console.log("💰 SOL余额:", solBalance / LAMPORTS_PER_SOL, "SOL");

  if (solBalance === 0) {
    console.log("  ⚠️  未收到SOL");
  } else {
    console.log("  ✅ 已收到SOL");
  }
  console.log("");

  // 检查所有token账户
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    provider.publicKey,
    { programId: TOKEN_PROGRAM_ID }
  );

  console.log(`📊 Token账户数量: ${tokenAccounts.value.length}\n`);

  if (tokenAccounts.value.length === 0) {
    console.log("❌ 未找到任何token账户");
    console.log("   可能tokens还在转账中，请稍等片刻后重试");
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
  console.log("📋 总结:");
  console.log("  SOL余额:", solBalance / LAMPORTS_PER_SOL, "SOL");
  console.log("  Token账户:", tokenAccounts.value.length);
  console.log("  总Tokens:", totalTokens);
  console.log("");

  if (solBalance >= 0.01 * LAMPORTS_PER_SOL && totalTokens >= 1.02) {
    console.log("✅ 资金充足，可以开始E2E测试！");
    console.log("");
    console.log("运行测试:");
    console.log("  ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \\");
    console.log("  ANCHOR_WALLET=~/.config/solana/id.json \\");
    console.log("  npx ts-mocha -p ./tsconfig.json -t 1000000 tests/complete-e2e-test.ts");
  } else {
    console.log("⚠️  资金不足:");
    if (solBalance < 0.01 * LAMPORTS_PER_SOL) {
      console.log("  - 需要更多SOL (至少0.01 SOL用于gas费)");
    }
    if (totalTokens < 1.02) {
      console.log("  - 需要更多tokens (至少1.02用于保证金)");
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
