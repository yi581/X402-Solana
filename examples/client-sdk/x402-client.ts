import { Connection, PublicKey, Transaction, Keypair, SystemProgram } from '@solana/web3.js';
import { getOrCreateAssociatedTokenAccount } from '@solana/spl-token';
import * as anchor from '@coral-xyz/anchor';

interface X402ClientConfig {
  connection: Connection;
  programId: PublicKey;
  clientKeypair: Keypair;
  facilitatorUrl: string;
}

interface PaymentChallenge {
  type: string;
  amount: number;
  currency: string;
  provider: string;
  facilitator: string;
  details: {
    programId: string;
    requestCommitment: string;
    accounts: {
      config: string;
      providerBond: string;
      claim: string;
    };
    timeout: number;
  };
}

/**
 * X402 Insurance Client SDK
 * Handles automatic payment with insurance for API requests
 */
export class X402Client {
  private config: X402ClientConfig;

  constructor(config: X402ClientConfig) {
    this.config = config;
  }

  /**
   * Make an insured API request
   * Automatically handles 402 response and payment
   */
  async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    // First attempt - make request without payment
    let response = await fetch(url, options);

    // If 402 Payment Required, handle payment
    if (response.status === 402) {
      const paymentRequired = await response.json();
      const challenge: PaymentChallenge = paymentRequired.payment;

      console.log(`💳 Payment required: ${challenge.amount / 1_000_000} ${challenge.currency}`);

      // Create and process insurance payment
      const paymentProof = await this.purchaseInsurance(challenge);

      console.log(`✅ Insurance purchased: ${paymentProof}`);

      // Retry request with payment proof
      const headers = new Headers(options.headers);
      headers.set('x-payment-proof', paymentProof);
      headers.set('x-request-commitment', challenge.details.requestCommitment);

      response = await fetch(url, {
        ...options,
        headers
      });
    }

    return response;
  }

  /**
   * Purchase insurance for an API request
   */
  private async purchaseInsurance(challenge: PaymentChallenge): Promise<string> {
    const program = new anchor.Program(
      // IDL would be loaded here in production
      {} as any,
      this.config.programId,
      { connection: this.config.connection } as any
    );

    // Parse accounts from challenge
    const config = new PublicKey(challenge.details.accounts.config);
    const providerBond = new PublicKey(challenge.details.accounts.providerBond);
    const claim = new PublicKey(challenge.details.accounts.claim);
    const provider = new PublicKey(challenge.provider);

    // Create purchase_insurance instruction
    const requestCommitment = Buffer.from(challenge.details.requestCommitment, 'hex');
    const paymentAmount = new anchor.BN(challenge.amount);
    const timeoutMinutes = new anchor.BN(challenge.details.timeout);

    // Build instruction data manually (since we don't have full IDL access)
    const discriminator = Buffer.from([0x2f, 0x9e, 0x9b, 0x3a, 0x9c, 0x7f, 0x9d, 0x8e]); // purchase_insurance
    const data = Buffer.concat([
      discriminator,
      requestCommitment,
      paymentAmount.toArrayLike(Buffer, 'le', 8),
      timeoutMinutes.toArrayLike(Buffer, 'le', 8)
    ]);

    // Create transaction
    const transaction = new Transaction();

    transaction.add({
      keys: [
        { pubkey: config, isSigner: false, isWritable: false },
        { pubkey: providerBond, isSigner: false, isWritable: true },
        { pubkey: claim, isSigner: false, isWritable: true },
        { pubkey: this.config.clientKeypair.publicKey, isSigner: true, isWritable: true },
        { pubkey: provider, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
      ],
      programId: this.config.programId,
      data
    });

    // Get recent blockhash
    const { blockhash } = await this.config.connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = this.config.clientKeypair.publicKey;

    // Sign transaction
    transaction.sign(this.config.clientKeypair);

    // Send to facilitator for verification and settlement
    const serialized = transaction.serialize().toString('base64');

    // Verify with facilitator
    const verifyResponse = await fetch(`${this.config.facilitatorUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction: serialized })
    });

    if (!verifyResponse.ok) {
      const error = await verifyResponse.json();
      throw new Error(`Verification failed: ${error.reason}`);
    }

    const verifyResult = await verifyResponse.json();
    console.log(`✓ Transaction verified:`, verifyResult);

    // Settle with facilitator
    const settleResponse = await fetch(`${this.config.facilitatorUrl}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transaction: serialized,
        gasless: false // Set to true for gasless transactions
      })
    });

    if (!settleResponse.ok) {
      const error = await settleResponse.json();
      throw new Error(`Settlement failed: ${error.error}`);
    }

    const settleResult = await settleResponse.json();
    return settleResult.signature;
  }

  /**
   * Check facilitator capabilities
   */
  async getSupportedCapabilities() {
    const response = await fetch(`${this.config.facilitatorUrl}/supported`);
    return await response.json();
  }
}

/**
 * Example usage
 */
export async function exampleUsage() {
  const connection = new Connection('http://localhost:8899', 'confirmed');
  const clientKeypair = Keypair.generate();
  const programId = new PublicKey('DMahL9qujZiirzLXKFvJxHhsNxG9uXh1yi1EnUCYgH7w');

  const client = new X402Client({
    connection,
    programId,
    clientKeypair,
    facilitatorUrl: 'http://localhost:3000'
  });

  // Check capabilities
  const capabilities = await client.getSupportedCapabilities();
  console.log('Facilitator capabilities:', capabilities);

  // Make insured API request
  const response = await client.fetch('http://localhost:4021/api/data');
  const data = await response.json();
  console.log('Protected data:', data);
}
