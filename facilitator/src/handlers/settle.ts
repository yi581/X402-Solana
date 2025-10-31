import { Request, Response } from 'express';
import { Transaction, Keypair, sendAndConfirmTransaction } from '@solana/web3.js';
import { connection } from '../index.js';
import { SettleRequest, SettleResponse } from '../types.js';
import bs58 from 'bs58';

/**
 * Settle endpoint - signs and broadcasts the insurance transaction
 * Implements x402 /settle specification
 */
export async function settleHandler(req: Request, res: Response) {
  try {
    const { transaction: txBase64, gasless }: SettleRequest = req.body;

    if (!txBase64) {
      return res.status(400).json({
        success: false,
        error: 'Missing transaction data'
      });
    }

    // Decode transaction
    const txBuffer = Buffer.from(txBase64, 'base64');
    const transaction = Transaction.from(txBuffer);

    // Get recent blockhash only if transaction doesn't have one
    // (In gasless mode, client sets blockhash before signing)
    if (!transaction.recentBlockhash) {
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.lastValidBlockHeight = lastValidBlockHeight;
    }

    let signature: string;

    if (gasless) {
      // Gasless mode - facilitator pays gas fees
      if (process.env.KORA_RPC_URL) {
        // Use Kora for gasless settlement
        signature = await settleWithKora(transaction);
      } else if (process.env.FACILITATOR_PRIVATE_KEY) {
        // Use facilitator's own keypair for gasless
        signature = await settleWithFacilitatorSigner(transaction);
      } else {
        return res.status(500).json({
          success: false,
          error: 'Gasless mode requested but no fee payer configured (KORA_RPC_URL or FACILITATOR_PRIVATE_KEY)'
        });
      }
    } else {
      // Standard settlement - client pays gas
      // In this case, the transaction should already be signed by the client
      // We just broadcast it

      if (!transaction.signatures || transaction.signatures.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Transaction must be signed by client'
        });
      }

      // Send transaction
      signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed'
      });

      // Wait for confirmation
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight
      });
    }

    console.log(`✅ Insurance transaction settled: ${signature}`);

    const response: SettleResponse = {
      signature,
      success: true
    };

    res.json(response);

  } catch (error: any) {
    console.error('Settle error:', error);
    res.status(500).json({
      success: false,
      error: `Settlement failed: ${error.message}`
    });
  }
}

/**
 * Settle transaction using Kora gasless infrastructure
 */
async function settleWithKora(transaction: Transaction): Promise<string> {
  const koraRpcUrl = process.env.KORA_RPC_URL;
  const koraApiKey = process.env.KORA_API_KEY;

  if (!koraRpcUrl || !koraApiKey) {
    throw new Error('Kora configuration missing');
  }

  // Serialize transaction for Kora
  const serialized = transaction.serialize({
    requireAllSignatures: false,
    verifySignatures: false
  });

  // Call Kora's signAndSendTransaction endpoint
  const response = await fetch(`${koraRpcUrl}/signAndSendTransaction`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${koraApiKey}`
    },
    body: JSON.stringify({
      transaction: serialized.toString('base64'),
      options: {
        skipPreflight: false,
        commitment: 'confirmed'
      }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Kora settlement failed: ${error.message || response.statusText}`);
  }

  const result = await response.json();
  return result.signature;
}

/**
 * Alternative: Use facilitator's own keypair for gasless
 * (Facilitator pays gas, charges client separately)
 */
async function settleWithFacilitatorSigner(transaction: Transaction): Promise<string> {
  const privateKeyStr = process.env.FACILITATOR_PRIVATE_KEY;

  if (!privateKeyStr) {
    throw new Error('Facilitator private key not configured');
  }

  const facilitatorKeypair = Keypair.fromSecretKey(
    bs58.decode(privateKeyStr)
  );

  // Verify fee payer is set correctly
  if (!transaction.feePayer || !transaction.feePayer.equals(facilitatorKeypair.publicKey)) {
    throw new Error(`Fee payer must be set to facilitator (${facilitatorKeypair.publicKey.toString()})`);
  }

  // Facilitator signs the transaction (client signature should already be on it)
  // We use partialSign to add facilitator's signature without clearing client's signature
  transaction.partialSign(facilitatorKeypair);

  // Send the fully signed transaction
  const signature = await connection.sendRawTransaction(
    transaction.serialize(),
    {
      skipPreflight: false,
      preflightCommitment: 'confirmed'
    }
  );

  // Wait for confirmation
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  await connection.confirmTransaction({
    signature,
    blockhash,
    lastValidBlockHeight
  });

  return signature;
}
