import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Connection, PublicKey, Keypair } from '@solana/web3.js';
import { x402Insurance } from './x402-middleware.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4021;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Solana connection
const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'http://localhost:8899',
  'confirmed'
);

// Provider configuration
const providerKeypair = Keypair.generate(); // In production, load from secure storage
const programId = new PublicKey(
  process.env.PROGRAM_ID || 'DMahL9qujZiirzLXKFvJxHhsNxG9uXh1yi1EnUCYgH7w'
);

// X402 Insurance middleware configuration
const x402Config = {
  programId,
  provider: providerKeypair.publicKey,
  facilitatorUrl: process.env.FACILITATOR_URL || 'http://localhost:3000',
  connection,
  paymentAmount: 1_000_000, // 1 USDC
  timeoutMinutes: 5
};

// Public endpoints (no insurance required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'protected-api-example',
    provider: providerKeypair.publicKey.toBase58()
  });
});

app.get('/info', (req, res) => {
  res.json({
    name: 'AI Agent API with X402 Insurance',
    description: 'Example API protected by X402 Insurance Protocol',
    provider: providerKeypair.publicKey.toBase58(),
    pricing: {
      amount: x402Config.paymentAmount / 1_000_000,
      currency: 'USDC',
      insurance: 'Covered by X402 Insurance - guaranteed service or 2x refund'
    },
    endpoints: {
      protected: [
        'GET /api/data',
        'POST /api/process',
        'GET /api/ai-inference'
      ]
    }
  });
});

// Protected endpoints (require insurance payment)
app.get('/api/data', x402Insurance(x402Config), (req, res) => {
  res.json({
    data: 'This is protected data that requires insurance payment',
    timestamp: Date.now(),
    provider: providerKeypair.publicKey.toBase58()
  });
});

app.post('/api/process', x402Insurance(x402Config), (req, res) => {
  const { input } = req.body;

  res.json({
    result: `Processed: ${input}`,
    timestamp: Date.now(),
    provider: providerKeypair.publicKey.toBase58()
  });
});

app.get('/api/ai-inference', x402Insurance(x402Config), async (req, res) => {
  const { prompt } = req.query;

  // Simulate AI processing
  await new Promise(resolve => setTimeout(resolve, 1000));

  res.json({
    prompt,
    response: `AI response to: ${prompt}`,
    model: 'example-gpt-4',
    tokens: 42,
    timestamp: Date.now(),
    provider: providerKeypair.publicKey.toBase58()
  });
});

// Endpoint to confirm service (called by provider after successful delivery)
app.post('/api/confirm', async (req, res) => {
  const { requestCommitment, signature } = req.body;

  // In production, provider would call confirm_service instruction here
  res.json({
    confirmed: true,
    requestCommitment,
    message: 'Service confirmed, provider bond unlocked'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Protected API running on port ${PORT}`);
  console.log(`🔐 Provider: ${providerKeypair.publicKey.toBase58()}`);
  console.log(`💰 Price: ${x402Config.paymentAmount / 1_000_000} USDC per request`);
  console.log(`🛡️  Insurance: X402 Protocol - 2x refund on timeout`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /health - Health check`);
  console.log(`  GET  /info - API information`);
  console.log(`  GET  /api/data - Protected data (requires payment)`);
  console.log(`  POST /api/process - Protected processing (requires payment)`);
  console.log(`  GET  /api/ai-inference - Protected AI (requires payment)`);
});
