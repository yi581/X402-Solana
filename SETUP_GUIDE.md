# X402 Insurance Protocol - Complete Setup Guide

## 📋 Prerequisites Checklist

Before you begin, ensure you have:

- [ ] macOS, Linux, or WSL2 (Windows)
- [ ] At least 20GB free disk space
- [ ] Stable internet connection
- [ ] Terminal/command line access

## 🔧 Step 1: Install Solana CLI

### Install Script

```bash
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
```

### Add to PATH

```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

Add this to your `~/.bashrc` or `~/.zshrc` for persistence.

### Verify Installation

```bash
solana --version
# Expected output: solana-cli 1.17.x (or higher)
```

## 🦀 Step 2: Install Rust

### Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Select **1) Proceed with installation (default)**

### Configure Current Shell

```bash
source "$HOME/.cargo/env"
```

### Verify Installation

```bash
rustc --version
# Expected output: rustc 1.70.x (or higher)

cargo --version
# Expected output: cargo 1.70.x (or higher)
```

## ⚓ Step 3: Install Anchor Framework

### Install AVM (Anchor Version Manager)

```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
```

This may take 10-15 minutes.

### Install Latest Anchor

```bash
avm install latest
avm use latest
```

### Verify Installation

```bash
anchor --version
# Expected output: anchor-cli 0.29.x (or higher)
```

## 🗝️ Step 4: Create Solana Wallet

### Generate New Wallet

```bash
solana-keygen new --outfile ~/.config/solana/id.json
```

**⚠️ IMPORTANT**:
- Write down your seed phrase!
- Never share your private key!
- This is your devnet wallet (safe to use for testing)

### Set Configuration

```bash
# Set network to devnet
solana config set --url devnet

# Verify configuration
solana config get
```

Expected output:
```
Config File: ~/.config/solana/cli/config.yml
RPC URL: https://api.devnet.solana.com
WebSocket URL: wss://api.devnet.solana.com/
Keypair Path: ~/.config/solana/id.json
```

### Get Devnet SOL

```bash
solana airdrop 2
```

If airdrop fails, try:
```bash
solana airdrop 1
# Wait 30 seconds
solana airdrop 1
```

### Check Balance

```bash
solana balance
# Expected: 2 SOL
```

## 📦 Step 5: Setup Project

### Clone Repository

```bash
cd ~/projects  # or your preferred directory
git clone https://github.com/your-org/solana-x402.git
cd solana-x402
```

### Install Node Dependencies

```bash
npm install
```

If you get errors:
```bash
# Try with legacy peer deps
npm install --legacy-peer-deps
```

## 🏗️ Step 6: Build the Program

### Build

```bash
anchor build
```

This will:
1. Compile Rust program (5-10 minutes first time)
2. Generate program keypair
3. Generate IDL (Interface Definition Language)

### Verify Build

```bash
ls target/deploy/
# Should see:
# - x402_insurance.so (compiled program)
# - x402_insurance-keypair.json

ls target/idl/
# Should see:
# - x402_insurance.json
```

## 🚀 Step 7: Deploy to Devnet

### Check Balance

```bash
solana balance
# Need at least 2 SOL
```

### Deploy

```bash
anchor deploy --provider.cluster devnet
```

Expected output:
```
Deploying workspace: https://api.devnet.solana.com
Upgrade authority: YourPublicKey...
Deploying program "x402_insurance"...
Program Id: X4o2EuYvQcS8hF9NKvmHKjYwRpGzAj4xTfP3Wq1Bxyz

Deploy success
```

### Update Anchor.toml

Copy the Program Id from the deploy output and update `Anchor.toml`:

```toml
[programs.devnet]
x402_insurance = "YOUR_PROGRAM_ID_HERE"
```

## ⚙️ Step 8: Initialize Protocol

### Run Initialization Script

```bash
node scripts/initialize.js
```

You'll be prompted:
```
Platform Treasury address [YourAddress]: (press Enter for default)
Platform penalty rate in basis points [200 = 2%]: (press Enter)
Default timeout in seconds [300 = 5 minutes]: (press Enter)
```

Expected output:
```
✅ Transaction signature: 5K7...
✅ Protocol initialized successfully!
```

## 🧪 Step 9: Run Tests

### Run All Tests

```bash
anchor test
```

This will:
1. Start local validator
2. Deploy program locally
3. Run test suite
4. Shut down validator

Expected output:
```
  x402_insurance
    ✓ Initialize insurance protocol (500ms)
    ✓ Provider deposits bond (300ms)
    ✓ Client purchases insurance (zero fee) (400ms)
    ✓ Provider confirms service (200ms)
    ✓ Client purchases another insurance and claims after timeout (600ms)
    ✓ Provider withdraws available bond (300ms)
    ✓ Summary: Economic model verification

  7 passing (3s)
```

## ✅ Verification Checklist

After setup, verify everything works:

- [ ] `solana --version` shows v1.17+
- [ ] `anchor --version` shows v0.29+
- [ ] `solana balance` shows at least 1 SOL on devnet
- [ ] `anchor build` completes without errors
- [ ] `anchor deploy --provider.cluster devnet` succeeds
- [ ] `node scripts/initialize.js` succeeds
- [ ] `anchor test` all tests pass

## 🐛 Troubleshooting

### Issue: "solana: command not found"

**Solution**: Add Solana to PATH
```bash
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
```

### Issue: "anchor: command not found"

**Solution**: Reinstall Anchor
```bash
cargo install --git https://github.com/coral-xyz/anchor avm --locked --force
avm install latest
avm use latest
```

### Issue: "Airdrop failed"

**Solution**: Try alternative devnet faucets
- https://solfaucet.com
- https://faucet.solana.com

Or request multiple times:
```bash
for i in {1..5}; do solana airdrop 1 && sleep 30; done
```

### Issue: "Insufficient funds for deployment"

**Solution**: Request more SOL
```bash
solana airdrop 2
# Check balance
solana balance
```

### Issue: "Build failed: rustc version mismatch"

**Solution**: Update Rust
```bash
rustup update stable
rustc --version
```

### Issue: "Test failed: account not found"

**Solution**: Rebuild and redeploy
```bash
anchor clean
anchor build
anchor test
```

### Issue: "npm install fails"

**Solution**: Use legacy peer deps
```bash
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

## 📊 Next Steps

### For Developers

1. Read the [README.md](README.md) for API documentation
2. Explore tests in `tests/x402_insurance.ts`
3. Review program code in `programs/x402_insurance/src/lib.rs`

### For Testers

1. Use `scripts/deploy.sh` for automated deployment
2. Test different scenarios manually
3. Report issues to GitHub

### For Production

1. Deploy to mainnet-beta (requires real SOL!)
2. Get security audit
3. Set up monitoring and alerts

## 🔒 Security Reminders

- ⚠️ **NEVER** share your private key
- ⚠️ **NEVER** use devnet wallet on mainnet
- ⚠️ **ALWAYS** back up your seed phrase
- ⚠️ **ALWAYS** test on devnet first

## 📞 Need Help?

- Discord: https://discord.gg/x402
- GitHub Issues: https://github.com/your-org/solana-x402/issues
- Email: support@x402.io

---

**Estimated Total Setup Time**: 30-60 minutes (depending on download speeds)

**Good luck!** 🚀
