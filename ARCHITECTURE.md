# X402 Insurance Facilitator Architecture

## 🏗️ System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         X402 Insurance Ecosystem                     │
└─────────────────────────────────────────────────────────────────────┘

┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│   AI Agent       │         │    Provider      │         │    Platform      │
│   (Client)       │         │    (API Host)    │         │   (Treasury)     │
└────────┬─────────┘         └────────┬─────────┘         └────────┬─────────┘
         │                            │                            │
         │ 1. Request API             │                            │
         ├────────────────────────────>                            │
         │                            │                            │
         │ 2. Return 402 + Challenge  │                            │
         <────────────────────────────┤                            │
         │                            │                            │
         │                            │                            │
┌────────▼───────────────────────────────────────────────────────────┤
│                    X402 Facilitator (Port 3000)                    │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │   /verify    │  │   /settle    │  │  /supported  │            │
│  │              │  │              │  │              │            │
│  │ • Decode TX  │  │ • Sign TX    │  │ • Return     │            │
│  │ • Check Bond │  │ • Broadcast  │  │   Caps       │            │
│  │ • Validate   │  │ • Confirm    │  │ • Tokens     │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│                                                                     │
│  Optional: Kora Integration for Gasless                            │
│  ┌──────────────────────────────────────────┐                     │
│  │  Kora RPC (Port 8080)                    │                     │
│  │  • signTransaction (for /verify)         │                     │
│  │  • signAndSendTransaction (for /settle)  │                     │
│  └──────────────────────────────────────────┘                     │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              │ 3. Purchase Insurance TX
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│                     Solana Blockchain                                │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  X402 Insurance Program                                        │ │
│  │  Program ID: DMahL9qujZiirzLXKFvJxHhsNxG9uXh1yi1EnUCYgH7w     │ │
│  │                                                                │ │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │ │
│  │  │ InsuranceConfig │  │  ProviderBond   │  │ InsuranceClaim│ │ │
│  │  │                 │  │                 │  │               │ │ │
│  │  │ • Platform Rate │  │ • Total Bond    │  │ • Commitment  │ │ │
│  │  │ • Timeout       │  │ • Locked Bond   │  │ • Amount      │ │ │
│  │  │ • Treasury      │  │ • Min Bond      │  │ • Deadline    │ │ │
│  │  └─────────────────┘  └─────────────────┘  │ • Status      │ │ │
│  │                                            └──────────────┘ │ │
│  │                                                                │ │
│  │  Instructions:                                                 │ │
│  │  1. initialize()         - Setup protocol                     │ │
│  │  2. deposit_bond()       - Provider deposits USDC             │ │
│  │  3. purchase_insurance() - Client buys insurance              │ │
│  │  4. confirm_service()    - Provider confirms delivery         │ │
│  │  5. claim_insurance()    - Client claims on timeout           │ │
│  │  6. withdraw_bond()      - Provider withdraws available bond  │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  Vault (PDA)                                                   │ │
│  │  • Holds all provider bonds (USDC)                            │ │
│  │  • Controlled by program                                       │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
                              │
                              │ 4. On-chain confirmation
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│                   Protected API (Port 4021)                          │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  x402Insurance Middleware                                      │ │
│  │                                                                │ │
│  │  1. Check for payment proof in headers                        │ │
│  │  2. If no proof → Return 402 + payment challenge              │ │
│  │  3. If proof exists → Verify on-chain                         │ │
│  │  4. If valid → Allow request to proceed                       │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  Protected Endpoints:                                                │
│  • GET  /api/data          - Protected data access                  │
│  • POST /api/process       - Protected computation                  │
│  • GET  /api/ai-inference  - Protected AI services                  │
└──────────────────────────────────────────────────────────────────────┘
```

## 🔄 Payment Flow Sequence

```
Client          Facilitator        Blockchain         API          Provider
  │                 │                   │              │               │
  │ 1. GET /api/data                    │              │               │
  ├─────────────────────────────────────────────────>  │               │
  │                 │                   │              │               │
  │ 2. 402 Payment Required + Challenge │              │               │
  │ <───────────────────────────────────────────────── │               │
  │                 │                   │              │               │
  │ 3. Create purchase_insurance TX     │              │               │
  │ (sign with client keypair)          │              │               │
  │                 │                   │              │               │
  │ 4. POST /verify │                   │              │               │
  ├────────────────>│                   │              │               │
  │                 │ 5. Check bond     │              │               │
  │                 ├──────────────────>│              │               │
  │                 │                   │              │               │
  │                 │ 6. Valid + details│              │               │
  │                 │ <─────────────────┤              │               │
  │ 7. Valid        │                   │              │               │
  │ <───────────────┤                   │              │               │
  │                 │                   │              │               │
  │ 8. POST /settle │                   │              │               │
  ├────────────────>│                   │              │               │
  │                 │ 9. Broadcast TX   │              │               │
  │                 ├──────────────────>│              │               │
  │                 │                   │ 10. Lock bond│               │
  │                 │                   │ (1.02x payment)              │
  │                 │                   │ Create claim │               │
  │                 │ 11. Signature     │              │               │
  │                 │ <─────────────────┤              │               │
  │ 12. Signature   │                   │              │               │
  │ <───────────────┤                   │              │               │
  │                 │                   │              │               │
  │ 13. Retry GET /api/data             │              │               │
  │ (X-Payment-Proof: signature)        │              │               │
  ├─────────────────────────────────────────────────>  │               │
  │                 │                   │ 14. Verify   │               │
  │                 │                   │ claim exists │               │
  │                 │                   │ <────────────┤               │
  │                 │                   │              │               │
  │ 15. Protected data (200 OK)         │              │               │
  │ <───────────────────────────────────────────────── │               │
  │                 │                   │              │ 16. Deliver   │
  │                 │                   │              │ service       │
  │                 │                   │              ├──────────────>│
  │                 │                   │              │               │
  │                 │                   │              │ 17. confirm_  │
  │                 │                   │              │ service()     │
  │                 │                   │ <────────────────────────────┤
  │                 │                   │ 18. Unlock bond              │
  │                 │                   │              │               │
```

## 💰 Economic Model Flow

### Happy Path (Service Delivered)

```
Initial State:
  Provider Bond: 5 USDC (unlocked)
  Client Balance: 10 USDC

Purchase Insurance (1 USDC payment):
  Client → Provider: 1 USDC (direct payment)
  Provider Bond: 5 USDC (3.98 unlocked, 1.02 locked)
  Client Balance: 9 USDC

Service Confirmed:
  Provider Bond: 5 USDC (5 unlocked - bond released)
  Provider received: 1 USDC (payment)
  Client: Receives service (paid 1 USDC)
  Status: ✅ Everyone happy
```

### Timeout Path (Service Failed)

```
Initial State:
  Provider Bond: 5 USDC (unlocked)
  Client Balance: 10 USDC

Purchase Insurance (1 USDC payment):
  Client → Provider: 1 USDC (direct payment)
  Provider Bond: 5 USDC (3.98 unlocked, 1.02 locked)
  Client Balance: 9 USDC

Timeout Reached + Client Claims:
  Provider Bond: 3.98 USDC (lost 1.02 from bond)
  Client: Receives 1 USDC refund (from provider's bond)
  Platform: Receives 0.02 USDC penalty (from provider's bond)
  Net Result:
    - Client: Paid 1, got back 1 = 0 net
    - Provider: Received 1, lost 1.02 bond = -0.02 USDC
    - Platform: +0.02 USDC
  Status: ⚠️ Provider penalized, client refunded, platform receives penalty
```

## 🔐 Security Model

### Account Validation

```
PDA Derivation:
  ├─ Config: seeds=[b"config"]
  ├─ Provider Bond: seeds=[b"provider_bond", provider_pubkey]
  ├─ Claim: seeds=[b"claim", request_commitment]
  └─ Vault: seeds=[b"vault"]

Each PDA is deterministically derived, preventing:
  ✅ Account spoofing
  ✅ Unauthorized access
  ✅ Race conditions
```

### Transaction Validation (Facilitator)

```
/verify endpoint checks:
  1. Transaction structure is valid
  2. Contains purchase_insurance instruction
  3. Client is a signer
  4. Provider bond exists and has sufficient funds
  5. Required lock amount = payment * 1.02
  6. Provider has available bond >= required lock
```

### On-Chain Validation (Smart Contract)

```
purchase_insurance() checks:
  1. Provider not liquidated
  2. Sufficient available bond
  3. Correct locked amount calculation
  4. Valid timeout period
  5. Claim account doesn't already exist
```

## 🌐 Integration Points

### 1. Standard x402 Protocol

Our facilitator implements the official x402 specification:
- `POST /verify` - Validates transactions
- `POST /settle` - Broadcasts transactions
- `GET /supported` - Advertises capabilities

### 2. Kora Gasless (Optional)

```
With Kora:
  Client → Facilitator → Kora RPC → Blockchain
  • Client signs transaction
  • Kora pays gas in SOL
  • Client only needs USDC

Without Kora:
  Client → Facilitator → Blockchain
  • Client pays gas in SOL
  • Facilitator can optionally sponsor
```

### 3. Protected APIs

```typescript
// Middleware integration
app.get('/api/endpoint',
  x402Insurance(config),  // ← Insurance check
  (req, res) => {
    // Protected handler
  }
);
```

## 📊 Data Structures

### On-Chain Accounts

```rust
InsuranceConfig (32 + 2 + 8 + 32 + 1 = 75 bytes)
  ├─ platform_treasury: Pubkey
  ├─ platform_penalty_rate: u16 (200 = 2%)
  ├─ default_timeout: u64 (300 = 5 min)
  ├─ authority: Pubkey
  └─ bump: u8

ProviderBond (32 + 8 + 8 + 8 + 1 + 1 = 58 bytes)
  ├─ provider: Pubkey
  ├─ total_bond: u64
  ├─ locked_bond: u64
  ├─ min_bond: u64
  ├─ is_liquidated: bool
  └─ bump: u8

InsuranceClaim (32 + 32 + 32 + 8 + 8 + 8 + 1 + 1 = 122 bytes)
  ├─ request_commitment: [u8; 32]
  ├─ client: Pubkey
  ├─ provider: Pubkey
  ├─ payment_amount: u64
  ├─ locked_amount: u64
  ├─ deadline: i64
  ├─ status: u8 (0=Pending, 1=Confirmed, 2=Claimed)
  └─ bump: u8
```

## 🚀 Deployment Architecture

### Development (Localnet)

```
┌────────────────────┐
│ solana-test-       │
│ validator          │
│ (localhost:8899)   │
└─────────┬──────────┘
          │
          ├─ Facilitator (localhost:3000)
          ├─ Protected API (localhost:4021)
          └─ Client SDK (test scripts)
```

### Production (Mainnet)

```
┌──────────────────────┐
│ Solana Mainnet       │
│ (api.mainnet-beta...) │
└───────────┬──────────┘
            │
            ├─ Facilitator (facilitator.x402.com)
            │  ├─ Load Balanced
            │  ├─ Rate Limited
            │  └─ Monitored
            │
            ├─ Multiple Provider APIs
            │  ├─ provider1.com
            │  ├─ provider2.com
            │  └─ ...
            │
            └─ Kora Gasless (optional)
               └─ kora.com:8080
```

## 📈 Scalability Considerations

### Facilitator Scaling

- Stateless design allows horizontal scaling
- Can run multiple facilitator instances
- Load balance across instances
- Each instance verifies independently

### On-Chain Scaling

- PDAs prevent account conflicts
- Parallel transaction processing
- No global state locks
- Provider-specific bonds allow concurrency

### API Scaling

- Middleware adds minimal overhead (~50ms)
- On-chain verification can be cached short-term
- Payment proofs immutable once confirmed
- Standard API scaling patterns apply

---

**For implementation details, see the code in `facilitator/`, `examples/`, and `programs/x402_insurance/`**
