#!/bin/bash

# X402 Solana Build Script
# Handles environment setup and builds the program

set -e

# Colors
GREEN='\033[0.32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}X402 Solana Build Script${NC}"
echo "================================"

# Setup environment - use local Solana tools if system ones have permission issues
LOCAL_SOLANA="$(pwd)/solana-release/bin"
if [ -d "$LOCAL_SOLANA" ] && [ -x "$LOCAL_SOLANA/cargo-build-sbf" ]; then
    export PATH="$HOME/.cargo/bin:$LOCAL_SOLANA:$PATH"
    echo -e "${YELLOW}Using local Solana toolchain from solana-release/${NC}"
else
    export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$PATH"
fi

# Check if running as root (we shouldn't be)
if [ "$EUID" -eq 0 ]; then
   echo -e "${RED}Error: Please do not run as root${NC}"
   exit 1
fi

# Clean problematic cache if permission issues exist
if [ ! -w "$HOME/.cache/solana" ] 2>/dev/null; then
    echo -e "${YELLOW}Cleaning Solana cache due to permission issues...${NC}"
    rm -rf "$HOME/.cache/solana" 2>/dev/null || true
    mkdir -p "$HOME/.cache/solana"
    chmod 755 "$HOME/.cache/solana"
fi

# Verify tools
echo "Checking environment..."
echo -n "Rust: "
rustc --version
echo -n "Anchor: "
anchor --version
echo -n "Solana: "
solana --version 2>/dev/null || echo "Not found in PATH (will use local)"

# Build
echo ""
echo -e "${GREEN}Building X402 Insurance Program...${NC}"
anchor build

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Build successful!${NC}"
    echo ""
    echo "Program ID: FpudwAQvMeZ4SiKyoz5E6zwh1SKEXuSj4nB4JTGsnEjq"
    echo "Output: target/deploy/x402_insurance.so"
    echo ""
    echo -e "${GREEN}Next steps:${NC}"
    echo "1. Run tests: anchor test"
    echo "2. Deploy to devnet: anchor deploy"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi
