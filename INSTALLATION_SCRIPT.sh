#!/bin/bash
# ============================================================================
# X402 Insurance Protocol - Solana 自动安装脚本
# ============================================================================
#
# 此脚本将自动安装所有必需的工具并构建测试项目
#
# 使用方法:
#   chmod +x INSTALLATION_SCRIPT.sh
#   ./INSTALLATION_SCRIPT.sh
#
# ============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}X402 Solana 项目自动安装${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ============================================================================
# Step 1: 安装 Rust
# ============================================================================
echo -e "${YELLOW}[1/6] 检查/安装 Rust${NC}"

if command -v rustc &> /dev/null; then
    echo -e "${GREEN}✅ Rust 已安装: $(rustc --version)${NC}"
else
    echo "正在安装 Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    echo -e "${GREEN}✅ Rust 安装完成${NC}"
fi

rustc --version
cargo --version
echo ""

# ============================================================================
# Step 2: 安装 Solana CLI
# ============================================================================
echo -e "${YELLOW}[2/6] 检查/安装 Solana CLI${NC}"

if command -v solana &> /dev/null; then
    echo -e "${GREEN}✅ Solana 已安装: $(solana --version)${NC}"
else
    echo "正在安装 Solana CLI..."
    sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

    # 添加到 shell 配置
    if [ -f "$HOME/.zshrc" ]; then
        echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> "$HOME/.zshrc"
    fi
    if [ -f "$HOME/.bashrc" ]; then
        echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> "$HOME/.bashrc"
    fi

    echo -e "${GREEN}✅ Solana CLI 安装完成${NC}"
fi

solana --version
echo ""

# ============================================================================
# Step 3: 配置 Solana
# ============================================================================
echo -e "${YELLOW}[3/6] 配置 Solana${NC}"

# 创建 devnet 钱包（如果不存在）
if [ ! -f "$HOME/.config/solana/id.json" ]; then
    echo "创建新的 Solana 钱包..."
    solana-keygen new --outfile "$HOME/.config/solana/id.json" --no-bip39-passphrase
    echo -e "${GREEN}✅ 钱包创建完成${NC}"
    echo -e "${RED}⚠️  重要: 请备份你的钱包文件: ~/.config/solana/id.json${NC}"
else
    echo -e "${GREEN}✅ 钱包已存在${NC}"
fi

# 设置 devnet
solana config set --url devnet
echo "当前配置:"
solana config get
echo ""

# 获取 devnet SOL
echo "获取 devnet SOL (可能需要多次尝试)..."
BALANCE=$(solana balance --url devnet 2>/dev/null | awk '{print $1}' || echo "0")
echo "当前余额: $BALANCE SOL"

if (( $(echo "$BALANCE < 2" | bc -l 2>/dev/null || echo "1") )); then
    echo "正在请求空投..."
    for i in {1..3}; do
        echo "尝试 $i/3..."
        solana airdrop 1 --url devnet 2>/dev/null || true
        sleep 5
    done
    BALANCE=$(solana balance --url devnet 2>/dev/null | awk '{print $1}' || echo "0")
    echo -e "${GREEN}✅ 最终余额: $BALANCE SOL${NC}"

    if (( $(echo "$BALANCE < 1" | bc -l 2>/dev/null || echo "1") )); then
        echo -e "${YELLOW}⚠️  余额不足，你可以稍后手动获取:${NC}"
        echo "   solana airdrop 2 --url devnet"
        echo "   或访问: https://solfaucet.com"
    fi
else
    echo -e "${GREEN}✅ 余额充足${NC}"
fi
echo ""

# ============================================================================
# Step 4: 安装 Anchor
# ============================================================================
echo -e "${YELLOW}[4/6] 检查/安装 Anchor${NC}"

if command -v anchor &> /dev/null; then
    echo -e "${GREEN}✅ Anchor 已安装: $(anchor --version)${NC}"
else
    echo "正在安装 Anchor (这可能需要 10-15 分钟)..."
    cargo install --git https://github.com/coral-xyz/anchor avm --locked --force

    # 安装最新版本
    avm install latest
    avm use latest

    echo -e "${GREEN}✅ Anchor 安装完成${NC}"
fi

anchor --version
echo ""

# ============================================================================
# Step 5: 安装 Node 依赖
# ============================================================================
echo -e "${YELLOW}[5/6] 安装 Node.js 依赖${NC}"

if [ ! -d "node_modules" ]; then
    echo "正在安装 npm 包..."
    npm install --legacy-peer-deps || npm install
    echo -e "${GREEN}✅ Node 依赖安装完成${NC}"
else
    echo -e "${GREEN}✅ Node 依赖已存在${NC}"
fi
echo ""

# ============================================================================
# Step 6: 构建和测试
# ============================================================================
echo -e "${YELLOW}[6/6] 构建程序${NC}"

echo "正在构建 Solana 程序 (首次构建需要 5-10 分钟)..."
anchor build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 构建成功！${NC}"
    echo ""

    # 显示程序 ID
    PROGRAM_ID=$(solana address -k target/deploy/x402_insurance-keypair.json 2>/dev/null || echo "未生成")
    echo "程序 ID: $PROGRAM_ID"
    echo ""

    # 询问是否运行测试
    read -p "是否运行测试? (y/n) [y]: " run_tests
    run_tests=${run_tests:-y}

    if [ "$run_tests" = "y" ] || [ "$run_tests" = "Y" ]; then
        echo ""
        echo -e "${YELLOW}运行测试...${NC}"
        anchor test

        if [ $? -eq 0 ]; then
            echo ""
            echo -e "${GREEN}========================================${NC}"
            echo -e "${GREEN}🎉 所有测试通过！${NC}"
            echo -e "${GREEN}========================================${NC}"
        else
            echo ""
            echo -e "${RED}❌ 测试失败${NC}"
            echo "检查错误信息并重试"
        fi
    fi
else
    echo -e "${RED}❌ 构建失败${NC}"
    echo "检查错误信息并重试"
    exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ 安装完成！${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "下一步:"
echo "1. 部署到 devnet:"
echo "   ./scripts/deploy.sh"
echo ""
echo "2. 初始化协议:"
echo "   node scripts/initialize.js"
echo ""
echo "3. 查看文档:"
echo "   cat README.md"
echo "   cat SETUP_GUIDE.md"
echo ""
echo "需要更多 devnet SOL? 运行:"
echo "   solana airdrop 2 --url devnet"
echo ""
