# X402 Insurance Facilitator

**Zero-fee insurance for AI agent API access on Solana**

Integrate the official x402 payment protocol with X402 Insurance to provide guaranteed service delivery with automatic 2x refunds on timeout.

## 🎯 Overview

This facilitator bridges the [official Solana x402 protocol](https://solana.com/zh/developers/guides/getstarted/build-a-x402-facilitator) with our X402 Insurance smart contract, enabling:

- ✅ **Gasless transactions** - Users pay in USDC without needing SOL
- ✅ **Automatic insurance** - Every payment is backed by provider bond
- ✅ **2x refunds on failure** - Guaranteed compensation if service times out
- ✅ **Standard x402 protocol** - Compatible with x402 ecosystem
- ✅ **Zero fees for clients** - Only pay for API usage, no insurance premiums

## 📂 Architecture

```
┌─────────────────┐
│   AI Agent      │
│   (Client)      │
└────────┬────────┘
         │ 1. API Request
         ↓
┌─────────────────────┐
│  Protected API      │  ←── x402 middleware
│  (Provider)         │
└────────┬────────────┘
         │ 2. Return 402 + Payment Challenge
         ↓
┌─────────────────────┐
│  X402 Facilitator   │  ←── /verify, /settle, /supported
│  (Port 3000)        │
└────────┬────────────┘
         │ 3. Verify & Settle
         ↓
┌─────────────────────┐
│  Solana Blockchain  │
│  X402 Insurance     │  ←── Smart contract on-chain
└─────────────────────┘
```

## 🚀 Quick Start

### 1. Start Facilitator Service

```bash
cd facilitator
npm install
cp .env.example .env

# Configure .env
# PROGRAM_ID=DMahL9qujZiirzLXKFvJxHhsNxG9uXh1yi1EnUCYgH7w
# SOLANA_RPC_URL=http://localhost:8899

npm start
```

The facilitator will run on port 3000 with three endpoints:
- `POST /verify` - Validate insurance transaction
- `POST /settle` - Sign and broadcast transaction
- `GET /supported` - Return capabilities

### 2. Start Protected API

```bash
cd examples/protected-api
npm install
npm start
```

API runs on port 4021 with protected endpoints requiring insurance payment.

### 3. Use Client SDK

```typescript
import { X402Client } from './x402-client';

const client = new X402Client({
  connection,
  programId,
  clientKeypair,
  facilitatorUrl: 'http://localhost:3000'
});

// Automatically handles 402 and payment
const response = await client.fetch('http://localhost:4021/api/data');
const data = await response.json();
```

## 📡 Facilitator Endpoints

### POST /verify

Validates insurance transaction without broadcasting.

**Request:**
```json
{
  "transaction": "base64-encoded-transaction",
  "context": {
    "provider": "ProviderPublicKey",
    "paymentAmount": 1000000
  }
}
```

**Response:**
```json
{
  "valid": true,
  "insuranceDetails": {
    "requestCommitment": "abc123...",
    "provider": "ProviderPubkey",
    "client": "ClientPubkey",
    "paymentAmount": 1000000,
    "lockedAmount": 1020000,
    "deadline": 1234567890
  }
}
```

### POST /settle

Signs and broadcasts the insurance transaction.

**Request:**
```json
{
  "transaction": "base64-encoded-transaction",
  "gasless": false
}
```

**Response:**
```json
{
  "signature": "transaction-signature",
  "success": true
}
```

### GET /supported

Returns facilitator capabilities.

**Response:**
```json
{
  "version": "1.0.0",
  "protocols": ["x402", "x402-insurance"],
  "features": {
    "gasless": true,
    "insurance": true,
    "batching": false
  },
  "tokens": [{
    "mint": "USDC-mint-address",
    "symbol": "USDC",
    "decimals": 6
  }],
  "programs": [{
    "programId": "DMahL9qujZiirzLXKFvJxHhsNxG9uXh1yi1EnUCYgH7w",
    "name": "X402 Insurance Protocol",
    "instructions": [
      "initialize",
      "deposit_bond",
      "purchase_insurance",
      "confirm_service",
      "claim_insurance",
      "withdraw_bond"
    ]
  }]
}
```

## 🔐 Protected API Example

### Setup Middleware

```typescript
import { x402Insurance } from './x402-middleware';

const x402Config = {
  programId: new PublicKey('DMahL9qujZiirzLXKFvJxHhsNxG9uXh1yi1EnUCYgH7w'),
  provider: providerKeypair.publicKey,
  facilitatorUrl: 'http://localhost:3000',
  connection,
  paymentAmount: 1_000_000, // 1 USDC
  timeoutMinutes: 5
};

// Protect endpoint with insurance
app.get('/api/data', x402Insurance(x402Config), (req, res) => {
  res.json({ data: 'protected content' });
});
```

### How It Works

1. **Client requests protected endpoint** → Returns 402 with payment challenge
2. **Client creates insurance transaction** → Includes request commitment
3. **Facilitator verifies** → Checks provider bond and transaction validity
4. **Facilitator settles** → Broadcasts transaction on-chain
5. **Client retries with proof** → Includes signature in header
6. **API validates proof** → Checks on-chain claim exists
7. **API returns content** → Protected data delivered
8. **Provider confirms** → Unlocks bond after successful delivery

## 💰 Economic Model

| Event | Client | Provider | Platform |
|-------|--------|----------|----------|
| **Purchase Insurance** | Pays 1 USDC | Bond locked at 1.02 USDC | - |
| **Service Confirmed** | Gets service | Bond unlocked | - |
| **Timeout Claim** | Receives 2 USDC | Loses 1.02 USDC | Receives 0.02 USDC (2% penalty) |

**Key Features:**
- ✅ **Zero insurance fee** - Clients only pay for API usage
- ✅ **2% bond lock** - Minimal capital requirement for providers
- ✅ **2x refund guarantee** - Strong client protection
- ✅ **Platform penalty** - Discourages provider misbehavior

## 🔧 Gasless Integration (Kora)

Enable gasless transactions so users don't need SOL:

```bash
# .env
KORA_RPC_URL=http://localhost:8080
KORA_API_KEY=your-api-key
```

```typescript
// Client request
const response = await fetch('http://localhost:3000/settle', {
  method: 'POST',
  body: JSON.stringify({
    transaction: serialized,
    gasless: true  // ← Enable Kora gasless
  })
});
```

The facilitator will route through Kora's signer node, allowing USDC-only payments.

## 🧪 Testing

### Manual Test Flow

1. Start validator:
```bash
solana-test-validator
```

2. Deploy program:
```bash
anchor deploy
```

3. Start services:
```bash
# Terminal 1: Facilitator
cd facilitator && npm start

# Terminal 2: Protected API
cd examples/protected-api && npm start
```

4. Test with curl:
```bash
# Get API info
curl http://localhost:4021/info

# Attempt protected endpoint (returns 402)
curl http://localhost:4021/api/data

# Use client SDK to auto-handle payment
tsx examples/client-sdk/x402-client.ts
```

### Automated Tests

```bash
cd facilitator
npm test
```

## 📊 Comparison with Official x402

| Feature | Official x402 | X402 Insurance |
|---------|---------------|----------------|
| **Purpose** | Micropayments for APIs | Insured API payments |
| **Payment Flow** | Direct USDC transfer | Bond-backed insurance |
| **Guarantees** | Payment confirmation | Service delivery or 2x refund |
| **Provider Risk** | None | Bond locked per request |
| **Client Protection** | Payment only | Payment + insurance |
| **Gasless** | Via Kora | Via Kora or facilitator |
| **Use Case** | General APIs | High-value AI agent services |

## 🛠️ Configuration Options

### Facilitator (.env)

```bash
# Network
SOLANA_RPC_URL=http://localhost:8899
SOLANA_NETWORK=localnet

# Program
PROGRAM_ID=DMahL9qujZiirzLXKFvJxHhsNxG9uXh1yi1EnUCYgH7w

# Gasless (optional)
KORA_RPC_URL=http://localhost:8080
KORA_API_KEY=your-key

# Signer (for gasless via facilitator)
FACILITATOR_PRIVATE_KEY=base58-private-key

# Token
USDC_MINT=usdc-mint-address
```

### Protected API

```typescript
const x402Config = {
  programId: PublicKey,        // X402 Insurance program
  provider: PublicKey,          // Your provider keypair
  facilitatorUrl: string,       // Facilitator endpoint
  connection: Connection,       // Solana RPC
  paymentAmount: number,        // Price in USDC (with decimals)
  timeoutMinutes: number        // Service timeout (default 5)
};
```

## 📚 Use Cases

1. **AI Agent Marketplaces**
   - Agents automatically pay for API access
   - Guaranteed refund if service fails
   - No manual payment handling

2. **High-Value API Services**
   - LLM inference, data processing, compute
   - Insurance protects against downtime
   - Provider incentivized to deliver

3. **Pay-Per-Use Infrastructure**
   - Serverless functions, databases, storage
   - Micro-transactions per request
   - Instant payment verification

4. **B2B API Integration**
   - Automated SLA enforcement
   - On-chain proof of service
   - Dispute resolution via insurance claims

## 🔗 Links

- **Solana x402 Guide**: https://solana.com/zh/developers/guides/getstarted/build-a-x402-facilitator
- **X402 Insurance Program**: `DMahL9qujZiirzLXKFvJxHhsNxG9uXh1yi1EnUCYgH7w`
- **Kora Gasless**: https://kora.com

## 📝 License

GPL-3.0 - Open source insurance for Web3

---

**Built with ❤️ for the Solana x402 ecosystem**
