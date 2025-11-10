#!/bin/bash
# ============================================================================
# X402 Insurance Protocol - Solana Automated Installation Script
# ============================================================================
#
# This script will automatically install all required tools and build the test project
#
# Usage:
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
echo -e "${BLUE}X402 Solana Project Auto Installation${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# ============================================================================
# Step 1: Install Rust
# ============================================================================
echo -e "${YELLOW}[1/6] Checking/Installing Rust${NC}"

if command -v rustc &> /dev/null; then
    echo -e "${GREEN}✅ Rust already installed: $(rustc --version)${NC}"
else
    echo "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    echo -e "${GREEN}✅ Rust installation complete${NC}"
fi

rustc --version
cargo --version
echo ""

# ============================================================================
# Step 2: Install Solana CLI
# ============================================================================
echo -e "${YELLOW}[2/6] Checking/Installing Solana CLI${NC}"

if command -v solana &> /dev/null; then
    echo -e "${GREEN}✅ Solana already installed: $(solana --version)${NC}"
else
    echo "Installing Solana CLI..."
    sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
    export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"

    # Add to shell configuration
    if [ -f "$HOME/.zshrc" ]; then
        echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> "$HOME/.zshrc"
    fi
    if [ -f "$HOME/.bashrc" ]; then
        echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> "$HOME/.bashrc"
    fi

    echo -e "${GREEN}✅ Solana CLI installation complete${NC}"
fi

solana --version
echo ""

# ============================================================================
# Step 3: Configure Solana
# ============================================================================
echo -e "${YELLOW}[3/6] Configuring Solana${NC}"

# Create devnet wallet (if doesn't exist)
if [ ! -f "$HOME/.config/solana/id.json" ]; then
    echo "Creating new Solana wallet..."
    solana-keygen new --outfile "$HOME/.config/solana/id.json" --no-bip39-passphrase
    echo -e "${GREEN}✅ Wallet creation complete${NC}"
    echo -e "${RED}⚠️  Important: Please backup your wallet file: ~/.config/solana/id.json${NC}"
else
    echo -e "${GREEN}✅ Wallet already exists${NC}"
fi

# Set devnet
solana config set --url devnet
echo "Current configuration:"
solana config get
echo ""

# Get devnet SOL
echo "Getting devnet SOL (may require multiple attempts)..."
BALANCE=$(solana balance --url devnet 2>/dev/null | awk '{print $1}' || echo "0")
echo "Current balance: $BALANCE SOL"

if (( $(echo "$BALANCE < 2" | bc -l 2>/dev/null || echo "1") )); then
    echo "Requesting airdrop..."
    for i in {1..3}; do
        echo "Attempt $i/3..."
        solana airdrop 1 --url devnet 2>/dev/null || true
        sleep 5
    done
    BALANCE=$(solana balance --url devnet 2>/dev/null | awk '{print $1}' || echo "0")
    echo -e "${GREEN}✅ Final balance: $BALANCE SOL${NC}"

    if (( $(echo "$BALANCE < 1" | bc -l 2>/dev/null || echo "1") )); then
        echo -e "${YELLOW}⚠️  Insufficient balance, you can manually get it later:${NC}"
        echo "   solana airdrop 2 --url devnet"
        echo "   or visit: https://solfaucet.com"
    fi
else
    echo -e "${GREEN}✅ Sufficient balance${NC}"
fi
echo ""

# ============================================================================
# Step 4: Install Anchor
# ============================================================================
echo -e "${YELLOW}[4/6] Checking/Installing Anchor${NC}"

if command -v anchor &> /dev/null; then
    echo -e "${GREEN}✅ Anchor already installed: $(anchor --version)${NC}"
else
    echo "Installing Anchor (this may take 10-15 minutes)..."
    cargo install --git https://github.com/coral-xyz/anchor avm --locked --force

    # Install latest version
    avm install latest
    avm use latest

    echo -e "${GREEN}✅ Anchor installation complete${NC}"
fi

anchor --version
echo ""

# ============================================================================
# Step 5: Install Node Dependencies
# ============================================================================
echo -e "${YELLOW}[5/6] Installing Node.js Dependencies${NC}"

if [ ! -d "node_modules" ]; then
    echo "Installing npm packages..."
    npm install --legacy-peer-deps || npm install
    echo -e "${GREEN}✅ Node dependencies installation complete${NC}"
else
    echo -e "${GREEN}✅ Node dependencies already exist${NC}"
fi
echo ""

# ============================================================================
# Step 6: Build and Test
# ============================================================================
echo -e "${YELLOW}[6/6] Building Program${NC}"

echo "Building Solana program (first build takes 5-10 minutes)..."
anchor build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Build successful!${NC}"
    echo ""

    # Display program ID
    PROGRAM_ID=$(solana address -k target/deploy/x402_insurance-keypair.json 2>/dev/null || echo "Not generated")
    echo "Program ID: $PROGRAM_ID"
    echo ""

    # Ask if want to run tests
    read -p "Run tests? (y/n) [y]: " run_tests
    run_tests=${run_tests:-y}

    if [ "$run_tests" = "y" ] || [ "$run_tests" = "Y" ]; then
        echo ""
        echo -e "${YELLOW}Running tests...${NC}"
        anchor test

        if [ $? -eq 0 ]; then
            echo ""
            echo -e "${GREEN}========================================${NC}"
            echo -e "${GREEN}🎉 All tests passed!${NC}"
            echo -e "${GREEN}========================================${NC}"
        else
            echo ""
            echo -e "${RED}❌ Tests failed${NC}"
            echo "Check error messages and try again"
        fi
    fi
else
    echo -e "${RED}❌ Build failed${NC}"
    echo "Check error messages and try again"
    exit 1
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Installation Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Deploy to devnet:"
echo "   ./scripts/deploy.sh"
echo ""
echo "2. Initialize protocol:"
echo "   node scripts/initialize.js"
echo ""
echo "3. View documentation:"
echo "   cat README.md"
echo "   cat SETUP_GUIDE.md"
echo ""
echo "Need more devnet SOL? Run:"
echo "   solana airdrop 2 --url devnet"
echo ""
