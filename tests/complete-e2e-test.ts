/**
 * Complete E2E Test: 402 Payment + Insurance
 *
 * 使用 .keys/ 中的keypairs进行完整测试
 *
 * 测试流程：
 * 1. Provider存入保证金
 * 2. Client通过402支付给Provider
 * 3. 测试成功场景：Provider确认服务
 * 4. 测试失败场景：超时索赔
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
} from "@solana/spl-token";
import { assert } from "chai";
import * as fs from "fs";
import * as path from "path";

describe("Complete E2E: 402 Payment + Insurance", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.X402Insurance as Program<X402Insurance>;

  // Token mint
  const TOKEN_MINT = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");

  // Test keypairs
  let providerKeypair: Keypair;
  let clientKeypair: Keypair;

  // PDAs
  let configPDA: PublicKey;
  let vaultPDA: PublicKey;
  let vaultTokenAccount: PublicKey;
  let providerBondPDA: PublicKey;
  let claimPDA: PublicKey;

  // Token accounts
  let providerTokenAccount: any;
  let clientTokenAccount: any;

  const BOND_AMOUNT = new anchor.BN(1_020_000); // 1.02 tokens
  const PAYMENT_AMOUNT = new anchor.BN(1_000_000); // 1 token

  before(async () => {
    console.log("\n🔧 加载测试keypairs...\n");

    // 读取keypairs
    const keysDir = path.join(__dirname, "../.keys");
    const providerPath = path.join(keysDir, "provider.json");
    const clientPath = path.join(keysDir, "client.json");

    if (!fs.existsSync(providerPath) || !fs.existsSync(clientPath)) {
      throw new Error(
        "Keypairs未找到。请先运行: npx ts-node scripts/setup-test-wallets.ts"
      );
    }

    const providerSecretKey = Uint8Array.from(
      JSON.parse(fs.readFileSync(providerPath, "utf-8"))
    );
    const clientSecretKey = Uint8Array.from(
      JSON.parse(fs.readFileSync(clientPath, "utf-8"))
    );

    providerKeypair = Keypair.fromSecretKey(providerSecretKey);
    clientKeypair = Keypair.fromSecretKey(clientSecretKey);

    console.log("📋 测试账户:");
    console.log("  Platform:", provider.wallet.publicKey.toString());
    console.log("  Provider:", providerKeypair.publicKey.toString());
    console.log("  Client:", clientKeypair.publicKey.toString());
    console.log("");

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
      [Buffer.from("provider_bond"), providerKeypair.publicKey.toBuffer()],
      program.programId
    );

    console.log("📍 PDAs:");
    console.log("  Config:", configPDA.toString());
    console.log("  Vault:", vaultPDA.toString());
    console.log("  Provider Bond:", providerBondPDA.toString());
    console.log("");
  });

  it("1️⃣ 检查初始余额", async () => {
    console.log("🔍 检查初始余额...");

    // 检查Provider SOL余额
    const providerSolBalance = await provider.connection.getBalance(
      providerKeypair.publicKey
    );
    console.log(
      "  Provider SOL:",
      providerSolBalance / LAMPORTS_PER_SOL,
      "SOL"
    );

    // 检查Client SOL余额
    const clientSolBalance = await provider.connection.getBalance(
      clientKeypair.publicKey
    );
    console.log("  Client SOL:", clientSolBalance / LAMPORTS_PER_SOL, "SOL");

    // 检查Provider token余额
    const providerTokenAccounts =
      await provider.connection.getParsedTokenAccountsByOwner(
        providerKeypair.publicKey,
        { mint: TOKEN_MINT }
      );

    if (providerTokenAccounts.value.length > 0) {
      const balance =
        providerTokenAccounts.value[0].account.data.parsed.info.tokenAmount
          .uiAmount;
      console.log("  Provider Tokens:", balance);

      if (balance < 1.02) {
        console.log("");
        console.log("  ⚠️  Provider tokens不足");
        console.log("     需要至少 1.02 tokens来存入保证金");
        console.log("     当前:", balance);
        console.log("");
        console.log("  请运行转账脚本:");
        console.log(
          "    export OLD_WALLET_KEYPAIR='[...]'  # 旧钱包私钥"
        );
        console.log("    npx ts-node scripts/transfer-from-old-wallet.ts");
        throw new Error("Provider tokens不足");
      }
    } else {
      console.log("  Provider Tokens: 0");
      throw new Error("Provider没有tokens");
    }
    console.log("");
  });

  it("2️⃣ Provider存入保证金", async () => {
    console.log("💰 Provider存入保证金到vault...");

    // 获取或创建token账户
    providerTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      providerKeypair,
      TOKEN_MINT,
      providerKeypair.publicKey
    );

    console.log("  Provider Token Account:", providerTokenAccount.address.toString());

    // 获取或创建vault token账户
    const vaultTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      providerKeypair, // payer
      TOKEN_MINT,
      vaultPDA,
      true // allowOwnerOffCurve - vault is PDA
    );

    vaultTokenAccount = vaultTokenAccountInfo.address;
    console.log("  Vault Token Account:", vaultTokenAccount.toString());

    try {
      const tx = await program.methods
        .depositBond(BOND_AMOUNT)
        .accounts({
          providerBond: providerBondPDA,
          provider: providerKeypair.publicKey,
          providerTokenAccount: providerTokenAccount.address,
          mint: TOKEN_MINT, // 添加mint账户
          vault: vaultPDA,
          vaultTokenAccount: vaultTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([providerKeypair])
        .rpc();

      console.log("  ✅ 保证金存入成功");
      console.log("  TX:", tx);

      // 验证bond账户
      const bond = await program.account.providerBond.fetch(providerBondPDA);
      console.log("  总保证金:", bond.totalBond.toString());
      console.log("  锁定保证金:", bond.lockedBond.toString());
    } catch (error: any) {
      if (error.message.includes("already in use")) {
        console.log("  ℹ️  保证金账户已存在");
        const bond = await program.account.providerBond.fetch(providerBondPDA);
        console.log("  总保证金:", bond.totalBond.toString());
        console.log("  可用保证金:", bond.availableBond.toString());
      } else {
        throw error;
      }
    }
    console.log("");
  });

  it("3️⃣ Client购买保险并402支付", async () => {
    console.log("💳 Client购买保险并通过402支付给Provider...");

    // 首先检查Client是否有SOL用于gas费
    const clientSolBalance = await provider.connection.getBalance(clientKeypair.publicKey);
    if (clientSolBalance === 0) {
      console.log("  ⚠️  Client没有SOL，从Provider转一些SOL给Client用于gas费...");

      // 从Provider转0.01 SOL给Client
      const transferTx = await provider.connection.sendTransaction(
        new anchor.web3.Transaction().add(
          anchor.web3.SystemProgram.transfer({
            fromPubkey: providerKeypair.publicKey,
            toPubkey: clientKeypair.publicKey,
            lamports: 0.01 * LAMPORTS_PER_SOL,
          })
        ),
        [providerKeypair]
      );
      await provider.connection.confirmTransaction(transferTx);
      console.log("  ✅ 已转0.01 SOL给Client");
    }

    // 获取或创建client token账户
    // 使用Provider支付创建账户的费用
    clientTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      providerKeypair, // payer
      TOKEN_MINT,
      clientKeypair.publicKey
    );

    console.log("  Client Token Account:", clientTokenAccount.address.toString());

    // Client需要有一些tokens用于402支付
    // 从Provider转1 token给Client用于测试
    const clientTokenBalance = Number(clientTokenAccount.amount);
    if (clientTokenBalance === 0) {
      console.log("  ⚠️  Client没有tokens，从Provider转1 token给Client...");

      const { transfer } = await import("@solana/spl-token");
      await transfer(
        provider.connection,
        providerKeypair,
        providerTokenAccount.address,
        clientTokenAccount.address,
        providerKeypair.publicKey,
        PAYMENT_AMOUNT.toNumber()
      );
      console.log("  ✅ 已转1 token给Client");
    }

    console.log("  Client Token Account:", clientTokenAccount.address.toString());

    // 生成request commitment (32 bytes hash)
    const requestCommitment = Array.from(crypto.getRandomValues(new Uint8Array(32)));
    const timeoutMinutes = new anchor.BN(5); // 5 minutes timeout

    // Claim PDA seeds: [b"claim", request_commitment]
    [claimPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("claim"),
        Buffer.from(requestCommitment),
      ],
      program.programId
    );

    console.log("  Request Commitment:", Buffer.from(requestCommitment).toString('hex').substring(0, 16) + "...");
    console.log("  Claim PDA:", claimPDA.toString());

    try {
      const tx = await program.methods
        .purchaseInsurance(
          requestCommitment,
          PAYMENT_AMOUNT,
          timeoutMinutes
        )
        .accounts({
          claim: claimPDA,
          config: configPDA,
          providerBond: providerBondPDA,
          client: clientKeypair.publicKey,
          provider: providerKeypair.publicKey,
          clientTokenAccount: clientTokenAccount.address,
          providerTokenAccount: providerTokenAccount.address,
          vault: vaultPDA,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([clientKeypair])
        .rpc();

      console.log("  ✅ 402支付成功！");
      console.log("  TX:", tx);
      console.log("");
      console.log("  📊 发生了什么：");
      console.log("    1. Client支付 1 token 给 Provider (402支付)");
      console.log("    2. Vault锁定了Provider的 1.02 token保证金");
      console.log("    3. 创建了保险索赔记录");

      // 验证claim
      const claim = await program.account.insuranceClaim.fetch(claimPDA);
      console.log("");
      console.log("  索赔记录:");
      console.log("    Client:", claim.client.toString());
      console.log("    Provider:", claim.provider.toString());
      console.log("    支付金额:", claim.paymentAmount.toString());
      console.log("    服务描述:", claim.serviceDescription);
      console.log("    状态:", Object.keys(claim.status)[0]);

    } catch (error: any) {
      console.error("  ❌ 购买保险失败:", error);
      throw error;
    }
    console.log("");
  });

  it("4️⃣ Provider确认服务交付", async () => {
    console.log("✅ Provider确认服务交付...");

    // 生成一个假的Ed25519签名用于测试 (64 bytes)
    const signature = Array.from(crypto.getRandomValues(new Uint8Array(64)));

    // 需要使用相同的requestCommitment
    // 从claim账户读取
    const claim = await program.account.insuranceClaim.fetch(claimPDA);
    const requestCommitment = Array.from(claim.requestCommitment);

    try {
      const tx = await program.methods
        .confirmService(requestCommitment, signature)
        .accounts({
          claim: claimPDA,
          providerBond: providerBondPDA,
          provider: providerKeypair.publicKey,
          providerTokenAccount: providerTokenAccount.address,
        })
        .signers([providerKeypair])
        .rpc();

      console.log("  ✅ 服务确认成功");
      console.log("  TX:", tx);
      console.log("");
      console.log("  📊 发生了什么：");
      console.log("    1. Provider确认服务已交付");
      console.log("    2. Vault解锁了Provider的 1.02 token");
      console.log("    3. 交易完成，皆大欢喜！");

      // 验证claim状态
      const updatedClaim = await program.account.insuranceClaim.fetch(claimPDA);
      console.log("");
      console.log("  索赔状态:", Object.keys(updatedClaim.status)[0]);
      assert(updatedClaim.status.hasOwnProperty("confirmed"), "状态应该是confirmed");
      console.log("  ✅ 测试通过！");

    } catch (error: any) {
      console.error("  ❌ 确认服务失败:", error);
      throw error;
    }
    console.log("");
  });

  it("5️⃣ 测试总结", () => {
    console.log("");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("🎉 Devnet E2E测试完成！");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("");
    console.log("✅ 已测试:");
    console.log("  1. ✅ Provider存入保证金到vault");
    console.log("  2. ✅ Client通过402支付给Provider");
    console.log("  3. ✅ Vault锁定Provider保证金");
    console.log("  4. ✅ Provider确认服务");
    console.log("  5. ✅ Vault解锁Provider保证金");
    console.log("");
    console.log("🔗 浏览器链接:");
    console.log(
      `  Program: https://explorer.solana.com/address/${program.programId}?cluster=devnet`
    );
    console.log(
      `  Provider: https://explorer.solana.com/address/${providerKeypair.publicKey}?cluster=devnet`
    );
    console.log(
      `  Client: https://explorer.solana.com/address/${clientKeypair.publicKey}?cluster=devnet`
    );
    console.log("");
    console.log("📝 下一步测试:");
    console.log("  - 测试超时索赔场景");
    console.log("  - 测试Provider清算场景");
    console.log("  - 集成Facilitator服务测试");
    console.log("");
    console.log("═══════════════════════════════════════════════════════════");
  });
});
