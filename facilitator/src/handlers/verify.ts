import { Request, Response } from 'express';
import { Transaction, PublicKey } from '@solana/web3.js';
import { connection, PROGRAM_ID } from '../index.js';
import { VerifyRequest, VerifyResponse } from '../types.js';
import * as anchor from '@coral-xyz/anchor';

/**
 * Verify endpoint - validates insurance payment transaction without broadcasting
 * Implements x402 /verify specification
 */
export async function verifyHandler(req: Request, res: Response) {
  try {
    const { transaction: txBase64, context }: VerifyRequest = req.body;

    if (!txBase64) {
      return res.status(400).json({
        valid: false,
        reason: 'Missing transaction data'
      });
    }

    // Decode transaction
    const txBuffer = Buffer.from(txBase64, 'base64');
    const transaction = Transaction.from(txBuffer);

    // Verify transaction structure
    if (!transaction.instructions || transaction.instructions.length === 0) {
      return res.status(400).json({
        valid: false,
        reason: 'Transaction has no instructions'
      });
    }

    // Find insurance purchase instruction
    const insuranceInstruction = transaction.instructions.find(
      (ix) => ix.programId.equals(PROGRAM_ID)
    );

    if (!insuranceInstruction) {
      return res.status(400).json({
        valid: false,
        reason: 'No X402 Insurance instruction found'
      });
    }

    // Decode instruction data to verify it's a purchase_insurance call
    // Instruction discriminator for purchase_insurance (first 8 bytes)
    const data = insuranceInstruction.data;

    if (data.length < 8) {
      return res.status(400).json({
        valid: false,
        reason: 'Invalid instruction data'
      });
    }

    // Extract accounts from instruction
    const accounts = insuranceInstruction.keys;

    // Expected accounts for purchase_insurance:
    // 0: config (PDA)
    // 1: provider_bond (PDA)
    // 2: claim (PDA)
    // 3: client (signer)
    // 4: provider
    // 5: system_program

    if (accounts.length < 6) {
      return res.status(400).json({
        valid: false,
        reason: 'Insufficient accounts in instruction'
      });
    }

    const configPDA = accounts[0].pubkey;
    const providerBondPDA = accounts[1].pubkey;
    const claimPDA = accounts[2].pubkey;
    const client = accounts[3].pubkey;
    const provider = accounts[4].pubkey;

    // Verify client is a signer
    if (!accounts[3].isSigner) {
      return res.status(400).json({
        valid: false,
        reason: 'Client must be a signer'
      });
    }

    // Decode payment amount and request commitment from instruction data
    // Format: [8 bytes discriminator][32 bytes commitment][8 bytes amount][8 bytes timeout]
    if (data.length < 56) {
      return res.status(400).json({
        valid: false,
        reason: 'Invalid instruction data length'
      });
    }

    const requestCommitment = data.slice(8, 40);
    const paymentAmount = new anchor.BN(data.slice(40, 48), 'le').toNumber();
    const timeoutMinutes = new anchor.BN(data.slice(48, 56), 'le').toNumber();

    // Verify provider bond exists and has sufficient funds
    try {
      const providerBondAccount = await connection.getAccountInfo(providerBondPDA);

      if (!providerBondAccount) {
        return res.status(400).json({
          valid: false,
          reason: 'Provider bond not found'
        });
      }

      // Decode provider bond (simplified - in production use IDL)
      const bondData = providerBondAccount.data;
      const totalBond = new anchor.BN(bondData.slice(40, 48), 'le').toNumber();
      const lockedBond = new anchor.BN(bondData.slice(48, 56), 'le').toNumber();
      const availableBond = totalBond - lockedBond;

      // Calculate required lock (payment * 1.02)
      const requiredLock = Math.floor(paymentAmount * 1.02);

      if (availableBond < requiredLock) {
        return res.status(400).json({
          valid: false,
          reason: `Insufficient bond: available ${availableBond}, required ${requiredLock}`
        });
      }

    } catch (error) {
      console.error('Error verifying provider bond:', error);
      return res.status(400).json({
        valid: false,
        reason: 'Failed to verify provider bond'
      });
    }

    // Calculate deadline
    const defaultTimeout = 300; // 5 minutes default
    const timeoutSeconds = timeoutMinutes > 0 ? timeoutMinutes * 60 : defaultTimeout;
    const deadline = Math.floor(Date.now() / 1000) + timeoutSeconds;

    // Transaction is valid
    const response: VerifyResponse = {
      valid: true,
      insuranceDetails: {
        requestCommitment: Buffer.from(requestCommitment).toString('hex'),
        provider,
        client,
        paymentAmount,
        lockedAmount: Math.floor(paymentAmount * 1.02),
        deadline
      }
    };

    console.log(`✅ Verified insurance purchase:`);
    console.log(`   Client: ${client.toBase58()}`);
    console.log(`   Provider: ${provider.toBase58()}`);
    console.log(`   Amount: ${paymentAmount / 1_000_000} USDC`);
    console.log(`   Locked: ${response.insuranceDetails.lockedAmount / 1_000_000} USDC`);

    res.json(response);

  } catch (error: any) {
    console.error('Verify error:', error);
    res.status(500).json({
      valid: false,
      reason: `Verification failed: ${error.message}`
    });
  }
}
