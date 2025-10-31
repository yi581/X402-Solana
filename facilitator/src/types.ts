import { PublicKey } from '@solana/web3.js';

// x402 standard types
export interface VerifyRequest {
  transaction: string; // Base64 encoded transaction
  context?: {
    requestCommitment?: string;
    provider?: string;
    client?: string;
    paymentAmount?: number;
  };
}

export interface VerifyResponse {
  valid: boolean;
  reason?: string;
  insuranceDetails?: {
    requestCommitment: string;
    provider: PublicKey;
    client: PublicKey;
    paymentAmount: number;
    lockedAmount: number;
    deadline: number;
  };
}

export interface SettleRequest {
  transaction: string; // Base64 encoded transaction
  gasless?: boolean; // Whether to use Kora gasless
}

export interface SettleResponse {
  signature: string;
  success: boolean;
  error?: string;
}

export interface SupportedCapabilities {
  version: '1.0.0';
  protocols: string[];
  features: {
    gasless: boolean;
    insurance: boolean;
    batching: boolean;
  };
  tokens: Array<{
    mint: string;
    symbol: string;
    decimals: number;
  }>;
  programs: Array<{
    programId: string;
    name: string;
    instructions: string[];
  }>;
}

// Insurance-specific types
export interface InsuranceConfig {
  platformTreasury: PublicKey;
  platformPenaltyRate: number;
  defaultTimeout: number;
  authority: PublicKey;
}

export interface ProviderBond {
  provider: PublicKey;
  totalBond: number;
  lockedBond: number;
  minBond: number;
  isLiquidated: boolean;
}

export interface InsuranceClaim {
  requestCommitment: Buffer;
  client: PublicKey;
  provider: PublicKey;
  paymentAmount: number;
  lockedAmount: number;
  deadline: number;
  status: 'Pending' | 'Confirmed' | 'Claimed';
}
