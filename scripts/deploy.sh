#!/bin/bash
# ============================================================================
# X402 Insurance Protocol - Solana Deployment Script
# ============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}X402 Insurance Protocol Deployment${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check prerequisites
echo -e "${YELLOW}[1/5] Checking prerequisites${NC}"

if ! command -v solana &> /dev/null; then
    echo -e "${RED}❌ Solana CLI not found${NC}"
    echo "Install: sh -c \"\$(curl -sSfL https://release.solana.com/stable/install)\""
    exit 1
fi

if ! command -v anchor &> /dev/null; then
    echo -e "${RED}❌ Anchor not found${NC}"
    echo "Install: cargo install --git https://github.com/coral-xyz/anchor avm --locked"
    exit 1
fi

echo -e "${GREEN}✅ Prerequisites OK${NC}"
echo ""

# Select network
echo -e "${YELLOW}[2/5] Select network${NC}"
echo "1) Devnet"
echo "2) Mainnet-beta"
read -p "Enter choice [1]: " network_choice
network_choice=${network_choice:-1}

if [ "$network_choice" = "1" ]; then
    NETWORK="devnet"
    RPC_URL="https://api.devnet.solana.com"
elif [ "$network_choice" = "2" ]; then
    NETWORK="mainnet-beta"
    RPC_URL="https://api.mainnet-beta.solana.com"
    echo -e "${RED}⚠️  WARNING: Deploying to MAINNET${NC}"
    read -p "Are you sure? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Deployment cancelled"
        exit 0
    fi
else
    echo "Invalid choice"
    exit 1
fi

echo -e "${GREEN}✅ Network: $NETWORK${NC}"
echo ""

# Configure Solana CLI
echo -e "${YELLOW}[3/5] Configuring Solana CLI${NC}"
solana config set --url $RPC_URL

# Check balance
BALANCE=$(solana balance | awk '{print $1}')
echo "Wallet balance: $BALANCE SOL"

if (( $(echo "$BALANCE < 2" | bc -l) )); then
    echo -e "${RED}❌ Insufficient balance. Need at least 2 SOL for deployment.${NC}"

    if [ "$NETWORK" = "devnet" ]; then
        echo "Get devnet SOL: solana airdrop 2"
    fi
    exit 1
fi

echo -e "${GREEN}✅ Balance OK${NC}"
echo ""

# Build program
echo -e "${YELLOW}[4/5] Building program${NC}"
anchor build

PROGRAM_ID=$(solana address -k target/deploy/x402_insurance-keypair.json)
echo "Program ID: $PROGRAM_ID"
echo ""

# Deploy
echo -e "${YELLOW}[5/5] Deploying to $NETWORK${NC}"
anchor deploy --provider.cluster $NETWORK

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Program ID: $PROGRAM_ID"
echo "Network: $NETWORK"
echo ""
echo "Next steps:"
echo "1. Update Anchor.toml with the new program ID"
echo "2. Run: node scripts/initialize.js"
echo "3. Run tests: anchor test"
echo ""
