/**
 * Devnet E2E Test: Complete 402 Payment + Insurance Flow
 *
 * 使用实际的Token: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
 * Provider余额: 10 tokens
 *
 * 完整测试流程：
 * 1. Provider存入保证金 (1.02 tokens)
 * 2. Client购买保险并通过402支付给Provider (1 token)
 * 3. Provider确认服务 - 成功场景
 * 4. 测试超时索赔场景
 */

import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { X402Insurance } from "../target/types/x402_insurance";
import {
  PublicKey,
  Keypair,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  getAccount,
  transfer,
} from "@solana/spl-token";
import { assert } from "chai";

describe("Devnet E2E: 402 Payment + Insurance", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.X402Insurance as Program<X402Insurance>;

  // 使用实际获得的Token mint
  const TOKEN_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

  // 从测试输出中的实际地址
  const PROVIDER_PUBKEY = new PublicKey("7RRuzQ6ix3L6LghJr1RdWCUKT4mJhUGwhaLecZwKeAim");
  const CLIENT_PUBKEY = new PublicKey("E9Uqea62vkLro7TMUtEUEqSQShUk4scr8AVQ8iYgpWV9");

  // PDAs
  let configPDA: PublicKey;
  let vaultPDA: PublicKey;
  let providerBondPDA: PublicKey;

  // 需要私钥来签名
  let providerKeypair: Keypair;
  let clientKeypair: Keypair;

  const BOND_AMOUNT = 1_020_000; // 1.02 tokens (6 decimals)
  const PAYMENT_AMOUNT = 1_000_000; // 1 token
  const DEFAULT_TIMEOUT = 300; // 5 minutes

  before(async () => {
    console.log("\n🔧 设置E2E测试环境...\n");

    // 派生PDAs
    [configPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      program.programId
    );

    [vaultPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      program.programId
    );

    [providerBondPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("provider_bond"), PROVIDER_PUBKEY.toBuffer()],
      program.programId
    );

    console.log("📍 PDAs:");
    console.log("  Config:", configPDA.toString());
    console.log("  Vault:", vaultPDA.toString());
    console.log("  Provider Bond:", providerBondPDA.toString());
    console.log("");

    console.log("⚠️  注意：此测试需要Provider和Client的私钥");
    console.log("   由于安全原因，我们需要手动提供keypair或调整测试方式");
    console.log("");
  });

  it("📊 检查初始余额", async () => {
    console.log("🔍 检查Provider初始余额...");

    // 获取Provider的token账户
    const providerTokenAccounts = await provider.connection.getParsedTokenAccountsByOwner(
      PROVIDER_PUBKEY,
      { mint: TOKEN_MINT }
    );

    if (providerTokenAccounts.value.length === 0) {
      throw new Error("Provider没有该Token的账户");
    }

    const tokenAccount = providerTokenAccounts.value[0];
    const balance = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount;

    console.log("  Provider Token账户:", tokenAccount.pubkey.toString());
    console.log("  余额:", balance, "tokens");
    console.log("");

    assert(balance >= 1.02, "Provider余额不足以存入保证金");
  });

  it("🔍 检查协议配置", async () => {
    console.log("检查协议配置状态...");

    const config = await program.account.insuranceConfig.fetchNullable(configPDA);

    if (config) {
      console.log("  ✅ 协议已初始化");
      console.log("  Platform Treasury:", config.platformTreasury.toString());
      console.log("  Penalty Rate:", config.platformPenaltyRate, "bps");
      console.log("  Default Timeout:", config.defaultTimeout.toString(), "seconds");
    } else {
      console.log("  ⚠️  协议未初始化");
    }
    console.log("");
  });

  it("📝 测试流程说明", () => {
    console.log("");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("📋 完整测试流程");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("");
    console.log("场景 1: 成功的402支付流程");
    console.log("  1. Provider存入1.02 token保证金到vault");
    console.log("  2. Client通过402支付1 token给Provider");
    console.log("  3. Vault记录此次支付并锁定Provider的1.02 token");
    console.log("  4. Provider确认服务交付");
    console.log("  5. Vault解锁Provider的1.02 token");
    console.log("");
    console.log("场景 2: 402支付失败 - Client获得保险赔付");
    console.log("  1. Provider存入1.02 token保证金");
    console.log("  2. Client通过402支付1 token给Provider");
    console.log("  3. Provider超时未确认服务");
    console.log("  4. Client发起索赔");
    console.log("  5. Client从vault获得1 token补偿");
    console.log("  6. 平台从Provider保证金获得0.02 token罚金");
    console.log("");
    console.log("场景 3: Provider保证金不足 - 清算");
    console.log("  1. Provider保证金降至阈值以下");
    console.log("  2. 24小时宽限期内未补足");
    console.log("  3. 剩余资金归平台所有");
    console.log("");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("");
    console.log("⚠️  注意：");
    console.log("  由于我们需要Provider和Client的私钥来签署交易，");
    console.log("  实际的交易测试需要使用实际的keypair文件或");
    console.log("  通过其他方式进行签名。");
    console.log("");
    console.log("🔗 浏览器链接:");
    console.log(`  Provider: https://explorer.solana.com/address/${PROVIDER_PUBKEY}?cluster=devnet`);
    console.log(`  Client: https://explorer.solana.com/address/${CLIENT_PUBKEY}?cluster=devnet`);
    console.log(`  Program: https://explorer.solana.com/address/${program.programId}?cluster=devnet`);
    console.log("");
  });
});
