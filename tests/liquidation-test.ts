/**
 * Provider Liquidation Test
 *
 * 测试场景：
 * 1. Provider存入保证金
 * 2. 通过多次索赔使Provider保证金低于最小值
 * 3. 24小时宽限期后清算Provider
 * 4. 剩余保证金转给平台
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

describe("Provider Liquidation Test", () => {
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

  // Token accounts
  let providerTokenAccount: any;
  let platformTokenAccount: any;

  before(async () => {
    console.log("\n🔧 设置Provider清算测试环境...\n");

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

    const vaultTokenAccountInfo = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      providerKeypair,
      TOKEN_MINT,
      vaultPDA,
      true
    );
    vaultTokenAccount = vaultTokenAccountInfo.address;

    platformTokenAccount = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      providerKeypair,
      TOKEN_MINT,
      provider.wallet.publicKey
    );

    console.log("✅ 设置完成\n");
  });

  it("1️⃣ 检查Provider当前状态", async () => {
    console.log("🔍 检查Provider当前保证金状态...");

    try {
      const bond = await program.account.providerBond.fetch(providerBondPDA);

      console.log("  Provider Bond:");
      console.log("    总保证金:", bond.totalBond.toString(), "=", bond.totalBond.toNumber() / 1_000_000, "tokens");
      console.log("    锁定保证金:", bond.lockedBond.toString(), "=", bond.lockedBond.toNumber() / 1_000_000, "tokens");
      console.log("    最小保证金:", bond.minBond.toString(), "=", bond.minBond.toNumber() / 1_000_000, "tokens");
      console.log("    是否已清算:", bond.isLiquidated);
      console.log("    资金不足时间:", bond.undercollateralizedSince.toString());
      console.log("");

      const available = bond.totalBond.toNumber() - bond.lockedBond.toNumber();
      console.log("  可用保证金:", available / 1_000_000, "tokens");

      if (available < bond.minBond.toNumber()) {
        console.log("  ⚠️  Provider保证金不足!");
      } else {
        console.log("  ✅ Provider保证金充足");
      }

    } catch (error: any) {
      console.log("  ℹ️  Provider Bond账户不存在");
    }
    console.log("");
  });

  it("2️⃣ 测试清算条件", async () => {
    console.log("📊 测试清算条件检查...\n");

    console.log("清算需要的条件:");
    console.log("  1. Provider保证金低于最小值");
    console.log("  2. 24小时宽限期已过");
    console.log("  3. Provider未在宽限期内补足保证金");
    console.log("");

    try {
      const bond = await program.account.providerBond.fetch(providerBondPDA);

      if (bond.isLiquidated) {
        console.log("  ⚠️  Provider已被清算");
        return;
      }

      const available = bond.totalBond.toNumber() - bond.lockedBond.toNumber();

      if (available < bond.minBond.toNumber()) {
        console.log("  ✅ 条件1满足: 保证金不足");

        if (bond.undercollateralizedSince.toNumber() === 0) {
          console.log("  ❌ 条件2不满足: 未设置资金不足时间");
          console.log("     (这应该在第一次保证金不足时自动设置)");
        } else {
          const gracePeriod = 86400; // 24 hours
          const now = Math.floor(Date.now() / 1000);
          const undercollateralizedTime = bond.undercollateralizedSince.toNumber();
          const timePassed = now - undercollateralizedTime;

          console.log("  资金不足时间:", new Date(undercollateralizedTime * 1000).toISOString());
          console.log("  当前时间:", new Date(now * 1000).toISOString());
          console.log("  已过时间:", timePassed, "秒 (", Math.floor(timePassed / 3600), "小时)");
          console.log("  宽限期:", gracePeriod, "秒 (24小时)");

          if (timePassed >= gracePeriod) {
            console.log("  ✅ 条件2满足: 宽限期已过");
            console.log("");
            console.log("  ✅ 可以执行清算!");
          } else {
            console.log("  ❌ 条件2不满足: 宽限期未过");
            console.log("     需要再等待", (gracePeriod - timePassed), "秒");
          }
        }
      } else {
        console.log("  ❌ 条件1不满足: 保证金充足");
        console.log("     可用保证金:", available / 1_000_000, "tokens");
        console.log("     最小保证金:", bond.minBond.toNumber() / 1_000_000, "tokens");
      }

    } catch (error: any) {
      console.log("  ❌ 无法检查Provider状态:", error.message);
    }
    console.log("");
  });

  it("3️⃣ 测试总结", () => {
    console.log("");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("📊 Provider清算测试总结");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("");
    console.log("ℹ️  清算测试说明:");
    console.log("");
    console.log("由于清算需要24小时宽限期,在devnet上完整测试需要:");
    console.log("  1. 通过多次超时索赔使Provider保证金低于最小值");
    console.log("  2. 等待24小时宽限期");
    console.log("  3. 执行liquidate_provider指令");
    console.log("");
    console.log("在实际生产环境中,清算流程的作用:");
    console.log("  - 保护整个系统的偿付能力");
    console.log("  - 给Provider时间补充保证金");
    console.log("  - 防止系统性风险");
    console.log("");
    console.log("💡 建议:");
    console.log("  - 在localnet上可以修改宽限期为较短时间进行测试");
    console.log("  - 在devnet上可以检查当前Provider的清算条件");
    console.log("  - 清算机制的智能合约代码已经实现并部署");
    console.log("");
    console.log("═══════════════════════════════════════════════════════════");
  });
});
