import { Request, Response } from 'express';
import { PROGRAM_ID } from '../index.js';
import { SupportedCapabilities } from '../types.js';

/**
 * Supported endpoint - advertises facilitator capabilities
 * Implements x402 /supported specification
 */
export async function supportedHandler(req: Request, res: Response) {
  const capabilities: SupportedCapabilities = {
    version: '1.0.0',
    protocols: ['x402', 'x402-insurance'],
    features: {
      gasless: !!process.env.KORA_RPC_URL || !!process.env.FACILITATOR_PRIVATE_KEY,
      insurance: true,
      batching: false // Could be added in future
    },
    tokens: [
      {
        mint: process.env.USDC_MINT || 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
        symbol: 'USDC',
        decimals: 6
      }
    ],
    programs: [
      {
        programId: PROGRAM_ID.toBase58(),
        name: 'X402 Insurance Protocol',
        instructions: [
          'initialize',
          'deposit_bond',
          'purchase_insurance',
          'confirm_service',
          'claim_insurance',
          'withdraw_bond'
        ]
      }
    ]
  };

  res.json(capabilities);
}
