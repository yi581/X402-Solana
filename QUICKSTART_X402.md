# X402 Facilitator Quick Start

**Get your X402 Insurance Facilitator running in 5 minutes!**

## 🚀 Prerequisites

- ✅ Solana CLI installed
- ✅ Node.js (v18+)
- ✅ Anchor deployed (tests passing from previous session)
- ✅ Local validator running

## 📋 Step-by-Step Setup

### Step 1: Verify Smart Contract is Deployed

```bash
# Should show the X402 Insurance program
anchor build
anchor deploy
```

Expected output:
```
Program Id: DMahL9qujZiirzLXKFvJxHhsNxG9uXh1yi1EnUCYgH7w
Deploy success
```

### Step 2: Install Facilitator Dependencies

```bash
cd facilitator
npm install
```

### Step 3: Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```bash
PORT=3000
SOLANA_RPC_URL=http://localhost:8899
SOLANA_NETWORK=localnet
PROGRAM_ID=DMahL9qujZiirzLXKFvJxHhsNxG9uXh1yi1EnUCYgH7w
```

### Step 4: Start Facilitator

```bash
npm start
```

Expected output:
```
🚀 X402 Insurance Facilitator running on port 3000
📡 Network: localnet
🔗 RPC: http://localhost:8899

✅ Ready to facilitate insurance payments!

Endpoints:
  POST /verify   - Verify insurance payment
  POST /settle   - Settle and broadcast transaction
  GET  /supported - Get supported capabilities
```

### Step 5: Test Facilitator

Open a new terminal:

```bash
# Test health check
curl http://localhost:3000/health

# Test capabilities
curl http://localhost:3000/supported
```

Expected response from `/supported`:
```json
{
  "version": "1.0.0",
  "protocols": ["x402", "x402-insurance"],
  "features": {
    "gasless": false,
    "insurance": true,
    "batching": false
  },
  "programs": [{
    "programId": "DMahL9qujZiirzLXKFvJxHhsNxG9uXh1yi1EnUCYgH7w",
    "name": "X402 Insurance Protocol"
  }]
}
```

### Step 6: Start Example Protected API

Open another terminal:

```bash
cd examples/protected-api
npm install
npm start
```

Expected output:
```
🚀 Protected API running on port 4021
🔐 Provider: AbC123...XyZ
💰 Price: 1 USDC per request
🛡️  Insurance: X402 Protocol - 2x refund on timeout

Endpoints:
  GET  /health - Health check
  GET  /info - API information
  GET  /api/data - Protected data (requires payment)
  POST /api/process - Protected processing (requires payment)
  GET  /api/ai-inference - Protected AI (requires payment)
```

### Step 7: Test Protected API

```bash
# Get API info (public)
curl http://localhost:4021/info

# Try protected endpoint (should return 402)
curl http://localhost:4021/api/data
```

Expected response (402):
```json
{
  "error": "Payment Required",
  "message": "This API requires X402 Insurance payment",
  "payment": {
    "type": "x402-insurance",
    "amount": 1000000,
    "currency": "USDC",
    "provider": "AbC123...XyZ",
    "facilitator": "http://localhost:3000",
    "details": {
      "programId": "DMahL9qujZiirzLXKFvJxHhsNxG9uXh1yi1EnUCYgH7w",
      "requestCommitment": "abc123...",
      "timeout": 5
    }
  }
}
```

## ✅ Success!

Your X402 Insurance Facilitator is now running! You have:

1. ✅ Facilitator service on port 3000
2. ✅ Protected API on port 4021
3. ✅ Smart contract deployed on localnet
4. ✅ x402 protocol integration complete

## 🔄 Complete Payment Flow Test

To test the full payment flow, you'll need to:

1. **Create a client with USDC** - Use the test setup from our tests
2. **Have a provider with bond** - Provider must deposit bond first
3. **Purchase insurance** - Client pays, provider bond locks
4. **Access protected API** - Payment proof grants access
5. **Confirm service** - Provider unlocks bond after delivery

See `X402_FACILITATOR_README.md` for detailed testing instructions.

## 🐛 Troubleshooting

### Facilitator won't start

**Error**: `Cannot find module ...`
```bash
cd facilitator
npm install
```

**Error**: `Connection refused to localhost:8899`
```bash
# Start validator
solana-test-validator
```

### Protected API returns 500

**Error**: `Program account not found`
```bash
# Redeploy program
anchor deploy
```

### No USDC for testing

```bash
# Use test tokens from test suite
cd ..
anchor test --skip-build --skip-deploy --skip-local-validator
```

## 🎯 Next Steps

1. **Integrate with your API** - Add x402Insurance middleware
2. **Deploy to Devnet** - Test with real USDC
3. **Add gasless support** - Integrate Kora RPC
4. **Monitor insurance claims** - Track on-chain events
5. **Scale to production** - Deploy on Mainnet

## 📚 Resources

- **Full Documentation**: `X402_FACILITATOR_README.md`
- **Test Suite**: `tests/x402_insurance.ts`
- **Client SDK**: `examples/client-sdk/x402-client.ts`
- **Official x402 Guide**: https://solana.com/zh/developers/guides/getstarted/build-a-x402-facilitator

---

**Questions? Check the main README or run the test suite to see working examples!**
