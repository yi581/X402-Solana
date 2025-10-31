import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Connection, PublicKey } from '@solana/web3.js';
import { verifyHandler } from './handlers/verify.js';
import { settleHandler } from './handlers/settle.js';
import { supportedHandler } from './handlers/supported.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize Solana connection
export const connection = new Connection(
  process.env.SOLANA_RPC_URL || 'http://localhost:8899',
  'confirmed'
);

export const PROGRAM_ID = new PublicKey(
  process.env.PROGRAM_ID || 'DMahL9qujZiirzLXKFvJxHhsNxG9uXh1yi1EnUCYgH7w'
);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'x402-insurance-facilitator',
    version: '1.0.0',
    network: process.env.SOLANA_NETWORK || 'localnet'
  });
});

// x402 Facilitator endpoints
app.post('/verify', verifyHandler);
app.post('/settle', settleHandler);
app.get('/supported', supportedHandler);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

app.listen(PORT, () => {
  console.log(`🚀 X402 Insurance Facilitator running on port ${PORT}`);
  console.log(`📡 Network: ${process.env.SOLANA_NETWORK || 'localnet'}`);
  console.log(`🔗 RPC: ${process.env.SOLANA_RPC_URL || 'http://localhost:8899'}`);
  console.log(`\n✅ Ready to facilitate insurance payments!`);
  console.log(`\nEndpoints:`);
  console.log(`  POST /verify   - Verify insurance payment`);
  console.log(`  POST /settle   - Settle and broadcast transaction`);
  console.log(`  GET  /supported - Get supported capabilities`);
});
