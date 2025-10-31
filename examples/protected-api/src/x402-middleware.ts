import { Request, Response, NextFunction } from 'express';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';

interface X402Config {
  programId: PublicKey;
  provider: PublicKey;
  facilitatorUrl: string;
  connection: Connection;
  paymentAmount: number; // in USDC (with decimals)
  timeoutMinutes?: number;
}

/**
 * X402 Insurance Middleware
 * Requires insurance payment for API access
 */
export function x402Insurance(config: X402Config) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Check for payment proof in headers
      const paymentProof = req.headers['x-payment-proof'] as string;
      const requestCommitment = req.headers['x-request-commitment'] as string;

      if (paymentProof && requestCommitment) {
        // Verify payment proof on-chain
        const isValid = await verifyPaymentProof(
          config,
          paymentProof,
          requestCommitment
        );

        if (isValid) {
          console.log(`✅ Valid insurance payment for request: ${requestCommitment}`);
          return next();
        }
      }

      // No valid payment - return 402 with insurance requirement
      const paymentChallenge = await createPaymentChallenge(config, req);

      res.status(402).json({
        error: 'Payment Required',
        message: 'This API requires X402 Insurance payment',
        payment: paymentChallenge
      });

    } catch (error: any) {
      console.error('X402 middleware error:', error);
      res.status(500).json({
        error: 'Insurance verification failed',
        message: error.message
      });
    }
  };
}

/**
 * Create payment challenge with insurance details
 */
async function createPaymentChallenge(config: X402Config, req: Request) {
  // Generate unique request commitment (hash of request details)
  const requestData = {
    path: req.path,
    method: req.method,
    timestamp: Date.now(),
    nonce: Math.random().toString(36).substring(7)
  };

  const requestCommitment = Buffer.from(
    JSON.stringify(requestData)
  ).toString('hex').slice(0, 64).padEnd(64, '0');

  // Derive PDAs
  const [configPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('config')],
    config.programId
  );

  const [providerBondPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('provider_bond'), config.provider.toBuffer()],
    config.programId
  );

  const [claimPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('claim'), Buffer.from(requestCommitment, 'hex')],
    config.programId
  );

  return {
    type: 'x402-insurance',
    amount: config.paymentAmount,
    currency: 'USDC',
    provider: config.provider.toBase58(),
    facilitator: config.facilitatorUrl,
    details: {
      programId: config.programId.toBase58(),
      requestCommitment,
      accounts: {
        config: configPDA.toBase58(),
        providerBond: providerBondPDA.toBase58(),
        claim: claimPDA.toBase58()
      },
      timeout: config.timeoutMinutes || 5
    }
  };
}

/**
 * Verify payment proof on-chain
 */
async function verifyPaymentProof(
  config: X402Config,
  proofSignature: string,
  requestCommitment: string
): Promise<boolean> {
  try {
    // Get transaction details
    const tx = await config.connection.getTransaction(proofSignature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });

    if (!tx || !tx.meta || tx.meta.err) {
      return false;
    }

    // Verify transaction includes our program
    const hasProgramInvocation = tx.transaction.message
      .getAccountKeys()
      .staticAccountKeys
      .some(key => key.equals(config.programId));

    if (!hasProgramInvocation) {
      return false;
    }

    // Fetch claim account to verify it exists and is pending/confirmed
    const [claimPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('claim'), Buffer.from(requestCommitment, 'hex')],
      config.programId
    );

    const claimAccount = await config.connection.getAccountInfo(claimPDA);

    if (!claimAccount) {
      return false;
    }

    // Decode claim status (simplified - should use IDL in production)
    // Status is at offset 104: 0=Pending, 1=Confirmed, 2=Claimed
    const status = claimAccount.data[104];

    // Valid if Pending (0) or Confirmed (1)
    return status === 0 || status === 1;

  } catch (error) {
    console.error('Payment verification error:', error);
    return false;
  }
}
