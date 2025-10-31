/**
 * Timeout Claim Test: Client claims insurance after Provider timeout
 *
 * 测试场景：
 * 1. Provider存入保证金
 * 2. Client购买保险并402支付
 * 3. Provider未在超时时间内确认服务
 * 4. Client发起索赔
 * 5. Client从vault获得1 token补偿
 * 6. 平台从Provider保证金获得0.02 token罚金
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

describe("Timeout Claim Test", () => {
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
  let platformTokenAccount: any;

  const BOND_AMOUNT = new anchor.BN(1_020_000); // 1.02 tokens
  const PAYMENT_AMOUNT = new anchor.BN(1_000_000); // 1 token
  const TIMEOUT_MINUTES = new anchor.BN(0); // 0 minutes = 即时超时(用于测试)

  let requestCommitment: number[];

  before(async () => {
    console.log("\n🔧 设置超时索赔测试环境...\n");

    // 读取keypairs
    const keysDir = path.join(__dirname, "../.keys");
    const providerPath = path.join(keysDir, "provider.json");
    const clientPath = path.join(keysDir, "client.json");

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

    // 获取token账户
    providerTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      providerKeypair,
      TOKEN_MINT,
      providerKeypair.publicKey
    );

    clientTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      providerKeypair,
      TOKEN_MINT,
      clientKeypair.publicKey
    );

    // Vault is a PDA-derived token account, NOT an associated token account
    // It's created with seeds [b"vault"] in the deposit_bond instruction
    // So we just pass the vaultPDA directly (which IS the token account)
    vaultTokenAccount = vaultPDA;

    // Platform token账户
    platformTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      providerKeypair,
      TOKEN_MINT,
      provider.wallet.publicKey
    );

    console.log("✅ 设置完成\n");
  });

  it("1️⃣ Client购买保险并支付 (Provider将超时)", async () => {
    console.log("💳 Client购买保险并支付...");

    // 首先检查Client是否有SOL用于gas费和账户创建
    const clientSolBalance = await provider.connection.getBalance(clientKeypair.publicKey);
    if (clientSolBalance < 0.01 * LAMPORTS_PER_SOL) {
      console.log("  从Provider转0.01 SOL给Client...");
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
    }

    // 确保Client有tokens
    const clientBalance = Number(clientTokenAccount.amount);
    if (clientBalance === 0) {
      console.log("  从Provider转1 token给Client...");
      const { transfer } = await import("@solana/spl-token");
      await transfer(
        provider.connection,
        providerKeypair,
        providerTokenAccount.address,
        clientTokenAccount.address,
        providerKeypair.publicKey,
        PAYMENT_AMOUNT.toNumber()
      );
    }

    // 生成request commitment
    requestCommitment = Array.from(crypto.getRandomValues(new Uint8Array(32)));

    [claimPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from("claim"), Buffer.from(requestCommitment)],
      program.programId
    );

    console.log("  Claim PDA:", claimPDA.toString());

    const tx = await program.methods
      .purchaseInsurance(requestCommitment, PAYMENT_AMOUNT, TIMEOUT_MINUTES)
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

    console.log("  ✅ 购买成功, TX:", tx);

    const claim = await program.account.insuranceClaim.fetch(claimPDA);
    console.log("  支付金额:", claim.paymentAmount.toString());
    console.log("  锁定金额:", claim.lockedAmount.toString());
    console.log("  截止时间:", new Date(claim.deadline.toNumber() * 1000).toISOString());
    console.log("");
  });

  it("2️⃣ 等待超时", async () => {
    console.log("⏰ 等待超时...");

    const claim = await program.account.insuranceClaim.fetch(claimPDA);
    const deadline = claim.deadline.toNumber();
    const now = Math.floor(Date.now() / 1000);

    console.log("  当前时间:", new Date(now * 1000).toISOString());
    console.log("  截止时间:", new Date(deadline * 1000).toISOString());

    if (now < deadline) {
      const waitTime = (deadline - now + 1) * 1000;
      console.log(`  需要等待 ${waitTime}ms...`);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      console.log("  ✅ 已超时");
    } else {
      console.log("  ✅ 已经超时");
    }
    console.log("");
  });

  it("3️⃣ Client发起索赔", async () => {
    console.log("🔔 Client发起保险索赔...");

    // 记录索赔前的余额
    const clientBalanceBefore = await getAccount(
      provider.connection,
      clientTokenAccount.address
    );
    const platformBalanceBefore = await getAccount(
      provider.connection,
      platformTokenAccount.address
    );
    const providerBondBefore = await program.account.providerBond.fetch(
      providerBondPDA
    );

    console.log("  索赔前:");
    console.log("    Client余额:", Number(clientBalanceBefore.amount) / 1_000_000);
    console.log("    Platform余额:", Number(platformBalanceBefore.amount) / 1_000_000);
    console.log("    Provider总保证金:", providerBondBefore.totalBond.toString());
    console.log("");

    try {
      const tx = await program.methods
        .claimInsurance(requestCommitment)
        .accounts({
          claim: claimPDA,
          config: configPDA,
          providerBond: providerBondPDA,
          client: clientKeypair.publicKey,
          clientTokenAccount: clientTokenAccount.address,
          platformTreasuryTokenAccount: platformTokenAccount.address,
          vault: vaultTokenAccount, // This is the vault token account derived with seeds [b"vault"]
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([clientKeypair])
        .rpc();

      console.log("  ✅ 索赔成功!");
      console.log("  TX:", tx);
      console.log("");

      // 验证索赔后的余额
      const clientBalanceAfter = await getAccount(
        provider.connection,
        clientTokenAccount.address
      );
      const platformBalanceAfter = await getAccount(
        provider.connection,
        platformTokenAccount.address
      );
      const providerBondAfter = await program.account.providerBond.fetch(
        providerBondPDA
      );
      const claim = await program.account.insuranceClaim.fetch(claimPDA);

      console.log("  索赔后:");
      console.log("    Client余额:", Number(clientBalanceAfter.amount) / 1_000_000);
      console.log("    Platform余额:", Number(platformBalanceAfter.amount) / 1_000_000);
      console.log("    Provider总保证金:", providerBondAfter.totalBond.toString());
      console.log("");

      console.log("  📊 验证结果:");
      const clientGain = Number(clientBalanceAfter.amount) - Number(clientBalanceBefore.amount);
      const platformGain = Number(platformBalanceAfter.amount) - Number(platformBalanceBefore.amount);
      const bondLoss = providerBondBefore.totalBond.toNumber() - providerBondAfter.totalBond.toNumber();

      console.log("    Client获得:", clientGain / 1_000_000, "tokens (应该是1)");
      console.log("    Platform获得:", platformGain / 1_000_000, "tokens (应该是0.02)");
      console.log("    Provider扣除:", bondLoss / 1_000_000, "tokens (应该是1.02)");
      console.log("    索赔状态:", Object.keys(claim.status)[0]);

      // 断言
      assert(clientGain === 1_000_000, "Client应该获得1 token补偿");
      assert(platformGain === 20_000, "Platform应该获得0.02 token罚金");
      assert(bondLoss === 1_020_000, "Provider保证金应该扣除1.02 token");
      assert(claim.status.hasOwnProperty("claimed"), "索赔状态应该是claimed");

      console.log("");
      console.log("  ✅ 所有验证通过!");

    } catch (error: any) {
      console.error("  ❌ 索赔失败:", error);
      throw error;
    }
  });

  it("4️⃣ 测试总结", () => {
    console.log("");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("🎉 超时索赔测试完成！");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("");
    console.log("✅ 验证的功能:");
    console.log("  1. ✅ Client购买保险并支付给Provider");
    console.log("  2. ✅ Provider超时未确认服务");
    console.log("  3. ✅ Client成功发起索赔");
    console.log("  4. ✅ Client从vault获得1 token补偿");
    console.log("  5. ✅ Platform获得0.02 token罚金");
    console.log("  6. ✅ Provider保证金正确扣除1.02 token");
    console.log("");
    console.log("📝 这证明了保险机制可以保护Client免受Provider服务失败的损失!");
    console.log("═══════════════════════════════════════════════════════════");
  });
});
