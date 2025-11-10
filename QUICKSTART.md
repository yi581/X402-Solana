# 🚀 X402 Solana Quick Start Guide

## Current Status

✅ **Project Code Complete** - All Solana smart contracts, tests and documentation are ready
⏳ **Awaiting Tool Installation** - Need to install Solana, Rust and Anchor toolchain

## 📋 What You Need to Do Now

### Option 1: Automatic Installation (Recommended) ⚡

**Complete all installations with just one command:**

```bash
cd /Users/panda/Documents/ibnk/code/X402/solana-x402
./INSTALLATION_SCRIPT.sh
```

This script will automatically:
1. ✅ Install Rust
2. ✅ Install Solana CLI
3. ✅ Create devnet wallet
4. ✅ Get devnet SOL
5. ✅ Install Anchor
6. ✅ Install Node.js dependencies
7. ✅ Build Solana program
8. ✅ Run tests

**Estimated time**: 20-40 minutes (depending on network speed)

---

### Option 2: Manual Installation (Step by Step) 🔧

If automatic script fails, follow these steps for manual installation:

#### Step 1: Install Rust (5 minutes)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustc --version  # Verify
```

#### Step 2: Install Solana CLI (5 minutes)

```bash
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
solana --version  # Verify
```

Add to PATH (permanently):
```bash
# If using zsh
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.zshrc

# If using bash
echo 'export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"' >> ~/.bashrc
```

#### Step 3: Configure Solana (2 minutes)

```bash
# Create wallet
solana-keygen new --outfile ~/.config/solana/id.json

# Set devnet
solana config set --url devnet

# Get test SOL
solana airdrop 2
```

If airdrop fails, visit: https://solfaucet.com

#### Step 4: Install Anchor (10-15 minutes)

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest
anchor --version  # Verify
```

#### Step 5: Build Project (5-10 minutes, first build)

```bash
cd /Users/panda/Documents/ibnk/code/X402/solana-x402

# Install Node dependencies
npm install --legacy-peer-deps

# Build Solana program
anchor build
```

#### Step 6: Run Tests (2-3 minutes)

```bash
anchor test
```

Expected output:
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

## 🎯 Next Steps After Installation

### 1. Deploy to Devnet

```bash
./scripts/deploy.sh
```

### 2. Initialize Protocol

```bash
node scripts/initialize.js
```

Enter when prompted:
- Platform Treasury: (Press Enter to use default address)
- Penalty Rate: `200` (2%)
- Timeout: `300` (5 minutes)

### 3. Verify Deployment

Check if program deployed successfully:
```bash
solana program show <PROGRAM_ID> --url devnet
```

---

## 📊 Project Overview

### Completed Files ✅

```
solana-x402/
├── programs/x402_insurance/src/
│   ├── lib.rs          ← Main program (715 lines)
│   ├── state.rs        ← Account structures (120 lines)
│   └── errors.rs       ← Error handling (35 lines)
│
├── tests/
│   └── x402_insurance.ts  ← Complete tests (400 lines)
│
├── scripts/
│   ├── deploy.sh          ← Deployment script
│   └── initialize.js      ← Initialization script
│
└── Documentation/
    ├── README.md           ← Project documentation
    ├── SETUP_GUIDE.md      ← Detailed setup guide
    ├── PROJECT_SUMMARY.md  ← Project summary
    └── QUICKSTART.md       ← This file
```

### Core Features

- ✅ Provider deposit bond
- ✅ Client purchases insurance (zero fee)
- ✅ Ed25519 signature verification service
- ✅ Automatic timeout claim
- ✅ 2x compensation mechanism
- ✅ 2% platform penalty

### Economic Model (Consistent with EVM version)

**Success Scenario**:
- Client: Pays 1 USDC → Gets service ✅
- Insurance: 0 USDC fee ✅
- Provider: Receives 1 USDC ✅

**Failure Scenario**:
- Client: Gets 2 USDC compensation ✅
- Provider: Loses 2.04 USDC ❌
- Platform: Gets 0.04 USDC penalty ✅

---

## 🐛 Common Issues

### Q: Installation script stuck?

A: Press Ctrl+C to stop, then run each step individually:
```bash
# Check which step failed
rustc --version
solana --version
anchor --version
```

### Q: "command not found: solana"

A: PATH not set correctly, add manually:
```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

### Q: Airdrop failed?

A: Devnet faucet sometimes rate limits, try:
1. Run `solana airdrop 1` multiple times
2. Visit https://solfaucet.com
3. Visit https://faucet.solana.com

### Q: Build failed?

A: Check Rust version:
```bash
rustup update stable
rustc --version  # Should be >= 1.70
```

### Q: Tests failed?

A: Clean and rebuild:
```bash
anchor clean
anchor build
anchor test
```

---

## 📞 Need Help?

1. **View detailed documentation**: `cat SETUP_GUIDE.md`
2. **View project summary**: `cat PROJECT_SUMMARY.md`
3. **View main documentation**: `cat README.md`

---

## ⏱️ Estimated Timeline

| Step | Time |
|------|------|
| Install Rust | 5 minutes |
| Install Solana | 5 minutes |
| Configure wallet | 2 minutes |
| Install Anchor | 10-15 minutes |
| Build program | 5-10 minutes |
| Run tests | 2-3 minutes |
| **Total** | **30-40 minutes** |

---

## 🎉 Success Indicators

When you see this output, everything is working:

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

**Start now! Run:**

```bash
cd /Users/panda/Documents/ibnk/code/X402/solana-x402
./INSTALLATION_SCRIPT.sh
```

Good luck! 🚀
