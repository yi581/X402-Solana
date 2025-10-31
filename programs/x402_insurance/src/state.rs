use anchor_lang::prelude::*;

/// Global insurance configuration
#[account]
pub struct InsuranceConfig {
    /// Platform treasury address for collecting penalties
    pub platform_treasury: Pubkey,
    /// Penalty rate (in basis points, e.g., 200 = 2%)
    pub platform_penalty_rate: u16,
    /// Default timeout in seconds (e.g., 300 = 5 minutes)
    pub default_timeout: u64,
    /// Grace period for undercollateralized providers (in seconds)
    pub liquidation_grace_period: u64,
    /// Admin authority
    pub authority: Pubkey,
    /// PDA bump
    pub bump: u8,
}

impl InsuranceConfig {
    pub const LEN: usize = 8 + // discriminator
        32 + // platform_treasury
        2 +  // platform_penalty_rate
        8 +  // default_timeout
        8 +  // liquidation_grace_period
        32 + // authority
        1;   // bump
}

/// Provider bond account (one per provider)
#[account]
pub struct ProviderBond {
    /// Provider's wallet address
    pub provider: Pubkey,
    /// Total bond deposited
    pub total_bond: u64,
    /// Currently locked bond (for active insurances)
    pub locked_bond: u64,
    /// Minimum bond required
    pub min_bond: u64,
    /// Whether provider is liquidated
    pub is_liquidated: bool,
    /// Timestamp when provider went below min_bond (0 if above min)
    pub undercollateralized_since: i64,
    /// PDA bump
    pub bump: u8,
}

impl ProviderBond {
    pub const LEN: usize = 8 + // discriminator
        32 + // provider
        8 +  // total_bond
        8 +  // locked_bond
        8 +  // min_bond
        1 +  // is_liquidated
        8 +  // undercollateralized_since
        1;   // bump
}

/// Insurance claim account (one per request)
#[account]
pub struct InsuranceClaim {
    /// Request commitment hash
    pub request_commitment: [u8; 32],
    /// Client who purchased insurance
    pub client: Pubkey,
    /// Provider who must fulfill service
    pub provider: Pubkey,
    /// Payment amount in lamports
    pub payment_amount: u64,
    /// Locked amount (payment_amount * 1.02)
    pub locked_amount: u64,
    /// Deadline timestamp (Unix seconds)
    pub deadline: i64,
    /// Current status
    pub status: ClaimStatus,
    /// PDA bump
    pub bump: u8,
}

impl InsuranceClaim {
    pub const LEN: usize = 8 + // discriminator
        32 + // request_commitment
        32 + // client
        32 + // provider
        8 +  // payment_amount
        8 +  // locked_amount
        8 +  // deadline
        1 +  // status
        1;   // bump
}

/// Status of an insurance claim
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum ClaimStatus {
    /// Pending - waiting for service confirmation
    Pending,
    /// Confirmed - service delivered, insurance completed
    Confirmed,
    /// Claimed - client claimed compensation after timeout
    Claimed,
}
