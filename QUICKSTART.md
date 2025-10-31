# 🚀 X402 Solana 快速开始指南

## 当前状态

✅ **项目代码已完成** - 所有 Solana 智能合约、测试和文档都已准备就绪
⏳ **等待工具安装** - 需要安装 Solana、Rust 和 Anchor 工具链

## 📋 你现在需要做什么

### 选项 1: 自动安装（推荐）⚡

**只需一条命令完成所有安装：**

```bash
cd /Users/panda/Documents/ibnk/code/X402/solana-x402
./INSTALLATION_SCRIPT.sh
```

这个脚本会自动：
1. ✅ 安装 Rust
2. ✅ 安装 Solana CLI
3. ✅ 创建 devnet 钱包
4. ✅ 获取 devnet SOL
5. ✅ 安装 Anchor
6. ✅ 安装 Node.js 依赖
7. ✅ 构建 Solana 程序
8. ✅ 运行测试

**预计时间**: 20-40 分钟（取决于网络速度）

---

### 选项 2: 手动安装（分步骤）🔧

如果自动脚本失败，按以下步骤手动安装：

#### Step 1: 安装 Rust (5 分钟)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustc --version  # 验证
```

#### Step 2: 安装 Solana CLI (5 分钟)

```bash
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana --version  # 验证
```

添加到 PATH（永久）：
```bash
# 如果使用 zsh
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.zshrc

# 如果使用 bash
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
```

#### Step 3: 配置 Solana (2 分钟)

```bash
# 创建钱包
solana-keygen new --outfile ~/.config/solana/id.json

# 设置 devnet
solana config set --url devnet

# 获取测试 SOL
solana airdrop 2
```

如果空投失败，访问: https://solfaucet.com

#### Step 4: 安装 Anchor (10-15 分钟)

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest
anchor --version  # 验证
```

#### Step 5: 构建项目 (5-10 分钟，首次构建)

```bash
cd /Users/panda/Documents/ibnk/code/X402/solana-x402

# 安装 Node 依赖
npm install --legacy-peer-deps

# 构建 Solana 程序
anchor build
```

#### Step 6: 运行测试 (2-3 分钟)

```bash
anchor test
```

期望输出：
```
  x402_insurance
    ✓ Initialize insurance protocol
    ✓ Provider deposits bond
    ✓ Client purchases insurance (zero fee)
    ✓ Provider confirms service
    ✓ Client claims insurance after timeout
    ✓ Provider withdraws available bond
    ✓ Summary: Economic model verification

  7 passing (3s)
```

---

## 🎯 安装后的下一步

### 1. 部署到 Devnet

```bash
./scripts/deploy.sh
```

### 2. 初始化协议

```bash
node scripts/initialize.js
```

按提示输入：
- Platform Treasury: (按 Enter 使用默认地址)
- Penalty Rate: `200` (2%)
- Timeout: `300` (5 分钟)

### 3. 验证部署

检查程序是否成功部署：
```bash
solana program show <PROGRAM_ID> --url devnet
```

---

## 📊 项目概览

### 已完成的文件 ✅

```
solana-x402/
├── programs/x402_insurance/src/
│   ├── lib.rs          ← 主程序 (715 行)
│   ├── state.rs        ← 账户结构 (120 行)
│   └── errors.rs       ← 错误处理 (35 行)
│
├── tests/
│   └── x402_insurance.ts  ← 完整测试 (400 行)
│
├── scripts/
│   ├── deploy.sh          ← 部署脚本
│   └── initialize.js      ← 初始化脚本
│
└── 文档/
    ├── README.md           ← 项目文档
    ├── SETUP_GUIDE.md      ← 详细安装指南
    ├── PROJECT_SUMMARY.md  ← 项目总结
    └── QUICKSTART.md       ← 本文件
```

### 核心功能

- ✅ Provider 存款 Bond
- ✅ Client 零费用购买保险
- ✅ Ed25519 签名验证服务
- ✅ 超时自动索赔
- ✅ 2x 补偿机制
- ✅ 2% 平台罚金

### 经济模型（与 EVM 版本一致）

**成功场景**:
- Client: 付 1 USDC → 获得服务 ✅
- Insurance: 0 USDC 费用 ✅
- Provider: 收 1 USDC ✅

**失败场景**:
- Client: 获得 2 USDC 补偿 ✅
- Provider: 损失 2.04 USDC ❌
- Platform: 获得 0.04 USDC 罚金 ✅

---

## 🐛 常见问题

### Q: 安装脚本卡住了？

A: 按 Ctrl+C 停止，然后单独运行每一步：
```bash
# 检查哪一步失败
rustc --version
solana --version
anchor --version
```

### Q: "command not found: solana"

A: PATH 没有正确设置，手动添加：
```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

### Q: 空投失败？

A: Devnet 水龙头有时会限流，尝试：
1. 多次运行 `solana airdrop 1`
2. 访问 https://solfaucet.com
3. 访问 https://faucet.solana.com

### Q: 构建失败？

A: 检查 Rust 版本：
```bash
rustup update stable
rustc --version  # 应该 >= 1.70
```

### Q: 测试失败？

A: 清理并重新构建：
```bash
anchor clean
anchor build
anchor test
```

---

## 📞 需要帮助？

1. **查看详细文档**: `cat SETUP_GUIDE.md`
2. **查看项目总结**: `cat PROJECT_SUMMARY.md`
3. **查看主文档**: `cat README.md`

---

## ⏱️ 预计时间线

| 步骤 | 时间 |
|------|------|
| 安装 Rust | 5 分钟 |
| 安装 Solana | 5 分钟 |
| 配置钱包 | 2 分钟 |
| 安装 Anchor | 10-15 分钟 |
| 构建程序 | 5-10 分钟 |
| 运行测试 | 2-3 分钟 |
| **总计** | **30-40 分钟** |

---

## 🎉 成功标志

当你看到以下输出，说明一切正常：

```bash
$ anchor test

  x402_insurance
    ✓ Initialize insurance protocol (500ms)
    ✓ Provider deposits bond (300ms)
    ✓ Client purchases insurance (zero fee) (400ms)
    ✓ Provider confirms service (200ms)
    ✓ Client purchases another insurance and claims after timeout (600ms)
    ✓ Provider withdraws available bond (300ms)
    ✓ Summary: Economic model verification

  7 passing (3s)

🎉 All tests completed!
```

---

**现在就开始吧！运行:**

```bash
cd /Users/panda/Documents/ibnk/code/X402/solana-x402
./INSTALLATION_SCRIPT.sh
```

祝你好运！🚀
