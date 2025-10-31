# Devnet测试指南

本指南说明如何在Solana Devnet上测试完整的X402保险协议。

## 当前状态

✅ 协议已部署到Devnet
- Program ID: `DMahL9qujZiirzLXKFvJxHhsNxG9uXh1yi1EnUCYgH7w`
- Config PDA: `5gi2Sc3a88FJBx9EneCu364dH8QfDBUXsqsX4mCqKokZ`
- Network: Devnet (`https://api.devnet.solana.com`)

## 测试步骤

### 1. 生成测试钱包

```bash
npx ts-node scripts/setup-test-wallets.ts
```

这将生成:
- Provider keypair: `.keys/provider.json`
- Client keypair: `.keys/client.json`

### 2. 转移tokens到新Provider钱包

如果您有旧钱包的私钥,可以使用转账脚本:

```bash
export OLD_WALLET_KEYPAIR='[1,2,3,...]'  # 旧钱包的私钥数组
npx ts-node scripts/transfer-from-old-wallet.ts
```

**或者**从水龙头直接获取到新Provider地址:
- Token Mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- 需要至少 1.02 tokens 来存入保证金

### 3. 申请SOL空投(用于gas费)

```bash
npx ts-node scripts/fund-test-wallets.ts
```

或手动从水龙头获取:
- https://faucet.solana.com

### 4. 运行完整E2E测试

```bash
ANCHOR_PROVIDER_URL=https://api.devnet.solana.com \
ANCHOR_WALLET=~/.config/solana/id.json \
npx ts-mocha -p ./tsconfig.json -t 1000000 tests/complete-e2e-test.ts
```

## 测试流程说明

### 场景 1: 成功的402支付流程

1. **Provider存入保证金** (1.02 tokens)
   - Provider将保证金存入vault
   - 创建Provider Bond账户

2. **Client购买保险并402支付** (1 token)
   - Client支付1 token给Provider (402支付)
   - Vault锁定Provider的1.02 token
   - 创建Insurance Claim记录

3. **Provider确认服务**
   - Provider确认服务已交付
   - Vault解锁1.02 token
   - Claim状态变为`Completed`

### 场景 2: 超时索赔(未实现)

1. Provider存入保证金
2. Client购买保险并支付
3. Provider超时未确认服务
4. Client发起索赔
5. Client从vault获得1 token补偿
6. 平台获得0.02 token罚金

### 场景 3: Provider清算(未实现)

1. Provider保证金降至阈值以下
2. 24小时宽限期内未补足
3. 剩余资金归平台所有

## 工具脚本

### 检查余额

```bash
npx ts-node scripts/check-balance.ts
```

### 查看所有token账户

```bash
npx ts-node scripts/check-all-tokens.ts
```

## 当前进度

✅ 已完成:
- [x] 部署到Devnet
- [x] 协议初始化
- [x] Provider存入保证金
- [x] Client购买保险(402支付)
- [x] Provider确认服务

⏳ 待测试:
- [ ] 超时索赔流程
- [ ] Provider清算流程
- [ ] 与Facilitator服务集成测试

## Token信息

- **使用的Token Mint**: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`
- **Decimals**: 6
- **初始余额**: 10 tokens (在旧Provider地址)

## 浏览器链接

- [Program Explorer](https://explorer.solana.com/address/DMahL9qujZiirzLXKFvJxHhsNxG9uXh1yi1EnUCYgH7w?cluster=devnet)
- [Config Account](https://explorer.solana.com/address/5gi2Sc3a88FJBx9EneCu364dH8QfDBUXsqsX4mCqKokZ?cluster=devnet)

## 故障排查

### Devnet空投限流

如果遇到429错误:
```
429 Too Many Requests: airdrop limit
```

解决方案:
1. 等待24小时后重试
2. 使用其他水龙头: https://faucet.solana.com
3. 从现有钱包转账

### Token账户未找到

确保:
1. Token mint地址正确
2. 已创建Associated Token Account
3. 使用`getOrCreateAssociatedTokenAccount`自动创建

## 安全提示

⚠️ **重要**: `.keys/`目录包含私钥,已添加到`.gitignore`
- 不要提交私钥到git
- 这些是测试用途的keypairs
- 不要在生产环境使用这些密钥
