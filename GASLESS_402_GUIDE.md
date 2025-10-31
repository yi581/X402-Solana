# Gasless 402支付指南

## 概述

X402保险协议现在支持真正的**gasless 402支付**,符合Solana官方402标准。Client只需要拥有token即可进行支付,无需持有SOL用于gas费用。

## 🎯 Gasless支付的优势

### 传统方式 (需要SOL)
```
Client需要:
✓ Token (用于402支付)
✓ SOL (用于gas费 + 账户租金)
```
**问题**:
- 用户需要同时持有两种资产
- 新用户进入门槛高
- 小额支付不经济

### Gasless方式 (只需Token)
```
Client只需要:
✓ Token (用于402支付)
✗ SOL - 不需要!
```
**优势**:
- ✅ 降低用户进入门槛
- ✅ 简化用户体验
- ✅ 符合Solana官方402标准
- ✅ 使微交易成为可能

---

## 🏗️ 架构设计

### 支付流程

```
┌─────────────┐
│   Client    │ (只有Token,没有SOL)
└──────┬──────┘
       │ 1. 创建并签署交易
       ├─────────────────────────────┐
       │                             │
       ▼                             ▼
┌──────────────────┐          ┌────────────────┐
│   Transaction    │          │  Token转账     │
│  (未设置feePayer) │          │  Client→Provider│
└──────┬───────────┘          └────────────────┘
       │
       │ 2. 发送到Facilitator
       │    gasless=true
       ▼
┌──────────────────────────┐
│   Facilitator服务器       │
│   - 读取FACILITATOR_PRIVATE_KEY
│   - 设置transaction.feePayer
│   - 签署并代付gas费
└──────┬───────────────────┘
       │
       │ 3. 广播到Solana
       ▼
┌──────────────────────────┐
│    Solana Network        │
│    - Facilitator支付gas   │
│    - Client支付token      │
│    - 保险记录上链         │
└──────────────────────────┘
```

---

## 🔧 配置Facilitator

### 1. 设置环境变量

编辑 `facilitator/.env`:

```bash
PORT=3000
NODE_ENV=development
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet
PROGRAM_ID=DMahL9qujZiirzLXKFvJxHhsNxG9uXh1yi1EnUCYgH7w

# Facilitator私钥 (用于代付gas费)
FACILITATOR_PRIVATE_KEY=<base58_encoded_private_key>
```

### 2. 获取Facilitator私钥

```bash
# 方法1: 使用现有keypair
node -e "const fs = require('fs'); const bs58 = require('bs58'); const keypair = JSON.parse(fs.readFileSync(process.env.HOME + '/.config/solana/id.json')); console.log(bs58.encode(Buffer.from(keypair)));"

# 方法2: 生成新keypair
solana-keygen new --outfile facilitator-keypair.json
node -e "const fs = require('fs'); const bs58 = require('bs58'); const keypair = JSON.parse(fs.readFileSync('facilitator-keypair.json')); console.log(bs58.encode(Buffer.from(keypair)));"
```

### 3. 确保Facilitator有足够的SOL

```bash
# 检查余额
solana balance <facilitator_public_key> --url devnet

# 如果不足,请求airdrop (devnet)
solana airdrop 1 <facilitator_public_key> --url devnet
```

### 4. 启动Facilitator

```bash
cd facilitator
npm install
npm run dev
```

---

## 💻 Client端使用方法

### 示例代码

```typescript
import * as anchor from "@coral-xyz/anchor";
import { Transaction, PublicKey } from "@solana/web3.js";
import fetch from "node-fetch";

// 0. 获取Facilitator的公钥 (通常从facilitator服务获取)
const facilitatorPubkey = new PublicKey("BVSHThCVPTKoqMYk3weVnafEivAV5gCSG2wX7MgcVF4F");

// 1. 创建购买保险的交易
const tx = await program.methods
  .purchaseInsurance(requestCommitment, paymentAmount, timeoutMinutes)
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
  .transaction();

// 2. 设置Facilitator为feePayer (gasless模式的关键!)
tx.feePayer = facilitatorPubkey;

// 3. 获取recent blockhash
const { blockhash } = await provider.connection.getLatestBlockhash();
tx.recentBlockhash = blockhash;

// 4. Client签署交易 (作为required signer,不是fee payer)
tx.partialSign(clientKeypair);

// 5. 序列化交易
const txBase64 = tx.serialize({
  requireAllSignatures: false,
  verifySignatures: false,
}).toString("base64");

// 6. 发送到Facilitator进行gasless结算
const response = await fetch("http://localhost:3000/settle", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    transaction: txBase64,
    gasless: true, // 启用gasless模式
  }),
});

const result = await response.json();
console.log("Transaction signature:", result.signature);
```

### ⚠️ 重要提示

**关键点**: Client必须在签署交易**之前**设置Facilitator为`feePayer`!

```typescript
// ❌ 错误: 先签名,后设置feePayer会导致签名失效
tx.sign(clientKeypair);
tx.feePayer = facilitatorPubkey; // 这会使client的签名失效!

// ✅ 正确: 先设置feePayer,再签名
tx.feePayer = facilitatorPubkey;
tx.partialSign(clientKeypair); // 使用partialSign保留空间给facilitator签名
```

**原理**:
- Solana交易的签名包含了`feePayer`信息
- 如果在签名后修改`feePayer`,之前的签名会失效
- 因此Client必须:
  1. 先设置facilitator为feePayer
  2. 设置blockhash
  3. 然后用`partialSign()`签署 (不用`sign()`,避免覆盖feePayer)
  4. Facilitator收到后用`partialSign()`添加自己的签名

---

## 🧪 测试Gasless功能

### 运行测试

```bash
# Devnet测试 (需要Facilitator运行)
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=~/.config/solana/id.json \
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/gasless-purchase-test.ts
```

### 测试验证项

1. ✅ Client只有token,没有SOL
2. ✅ 交易成功上链
3. ✅ Facilitator支付了gas费
4. ✅ Client的SOL余额没有变化
5. ✅ 保险记录正确创建

---

## 🔒 安全考虑

### Facilitator端

1. **私钥管理**
   - ⚠️  永远不要在代码中硬编码私钥
   - ✅ 使用环境变量
   - ✅ 生产环境使用密钥管理服务 (AWS KMS, HashiCorp Vault等)

2. **Gas费用控制**
   - 实施速率限制
   - 设置每用户/每IP的gas预算
   - 监控异常使用模式

3. **交易验证**
   - 验证交易指令是否符合预期
   - 检查账户权限
   - 防止恶意交易

### Client端

1. **交易签名**
   - Client仍需签署自己的交易
   - 只授权token转账,不授权其他操作

2. **Facilitator信任**
   - 选择可信的Facilitator服务
   - 验证Facilitator的响应
   - 保留交易签名记录

---

## 📊 成本分析

### Gas费用估算

| 操作 | Gas费用 (SOL) | USD (假设$100/SOL) |
|------|---------------|---------------------|
| 购买保险 | ~0.000005 | ~$0.0005 |
| 创建账户 | ~0.00001 | ~$0.001 |
| **总计** | ~0.000015 | ~$0.0015 |

### Facilitator运营成本

假设:
- 100,000 笔交易/天
- Gas费: 0.000015 SOL/笔
- SOL价格: $100

**日成本**: 100,000 × 0.000015 × $100 = **$150/天**

**月成本**: $150 × 30 = **$4,500/月**

**收益模式**:
- 向Client收取服务费 (如0.1% transaction fee)
- 或从Provider收取listing fee
- 或混合模式

---

## 🚀 生产部署建议

### 1. 使用专业的RPC服务

```bash
# 推荐RPC提供商
- Helius (https://helius.dev)
- QuickNode (https://quicknode.com)
- Triton (https://triton.one)
```

### 2. 集成Kora (可选)

如果要使用Kora的费用抽象服务:

```bash
# facilitator/.env
KORA_RPC_URL=https://api.kora.network/rpc
KORA_API_KEY=your_kora_api_key
```

### 3. 添加监控和告警

- Gas费用消耗监控
- 交易成功率监控
- 异常交易检测
- Facilitator余额告警

### 4. 实施负载均衡

- 多个Facilitator实例
- 轮询或加权分配
- 故障转移机制

---

## 📝 常见问题

### Q: 为什么不直接使用Kora?

A: 两种方案各有优势:
- **自建Facilitator**: 完全控制,无第三方依赖,成本可控
- **Kora**: 开箱即用,无需管理基础设施,但有API费用

我们的实现支持两者,可以根据需求选择。

### Q: Facilitator会不会作恶?

A: Facilitator只能:
- 代付gas费
- 广播已签署的交易

Facilitator**不能**:
- 修改Client签署的交易
- 盗取Client的token (需要Client签名)
- 执行未授权操作

### Q: 如果Facilitator宕机怎么办?

A: Client可以:
1. 切换到另一个Facilitator
2. 自己支付gas费直接提交交易
3. 等待Facilitator恢复

---

## ✨ 总结

Gasless 402支付是X402保险协议的重要特性,它:

1. ✅ **符合Solana官方标准** - 遵循官方402 Facilitator规范
2. ✅ **降低用户门槛** - Client只需要token
3. ✅ **灵活部署** - 支持自建或使用Kora
4. ✅ **生产就绪** - 完整的错误处理和安全措施

开始使用gasless 402支付,让您的Web3应用更易用!

---

*文档版本: 1.0*
*最后更新: 2025-10-31*
