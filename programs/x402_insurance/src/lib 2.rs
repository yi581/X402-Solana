use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

mod state;
mod errors;

use state::*;
use errors::*;

declare_id!("FpudwAQvMeZ4SiKyoz5E6zwh1SKEXuSj4nB4JTGsnEjq");

#[program]
pub mod x402_insurance {
    use super::*;

    /// Initialize the insurance protocol
    pub fn initialize(
        ctx: Context<Initialize>,
        platform_penalty_rate: u16,
        default_timeout: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.platform_treasury = ctx.accounts.platform_treasury.key();
        config.platform_penalty_rate = platform_penalty_rate;
        config.default_timeout = default_timeout;
        config.authority = ctx.accounts.authority.key();
        config.bump = ctx.bumps.config;

        msg!("Insurance protocol initialized with penalty rate: {}bps", platform_penalty_rate);
        Ok(())
    }

    /// Provider deposits bond into the protocol
    pub fn deposit_bond(ctx: Context<DepositBond>, amount: u64) -> Result<()> {
        let provider_bond = &mut ctx.accounts.provider_bond;

        // Transfer tokens from provider to vault
        let cpi_accounts = Transfer {
            from: ctx.accounts.provider_token_account.to_account_info(),
            to: ctx.accounts.vault.to_account_info(),
            authority: ctx.accounts.provider.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, amount)?;

        // Update bond account
        provider_bond.total_bond = provider_bond.total_bond
            .checked_add(amount)
            .ok_or(InsuranceError::ArithmeticOverflow)?;

        msg!("Provider {} deposited {} tokens", ctx.accounts.provider.key(), amount);
        Ok(())
    }

    /// Client purchases insurance (zero fee!)
    pub fn purchase_insurance(
        ctx: Context<PurchaseInsurance>,
        request_commitment: [u8; 32],
        payment_amount: u64,
        timeout_minutes: u64,
    ) -> Result<()> {
        let provider_bond = &mut ctx.accounts.provider_bond;
        let claim = &mut ctx.accounts.claim;
        let config = &ctx.accounts.config;

        // Check provider not liquidated
        require!(!provider_bond.is_liquidated, InsuranceError::ProviderLiquidated);

        // Calculate locked amount (payment_amount * 1.02)
        let locked_amount = payment_amount
            .checked_mul(102)
            .and_then(|v| v.checked_div(100))
            .ok_or(InsuranceError::ArithmeticOverflow)?;

        // Check sufficient available bond
        let available_bond = provider_bond.total_bond
            .checked_sub(provider_bond.locked_bond)
            .ok_or(InsuranceError::InsufficientBond)?;

        require!(available_bond >= locked_amount, InsuranceError::InsufficientBond);

        // Lock the bond
        provider_bond.locked_bond = provider_bond.locked_bond
            .checked_add(locked_amount)
            .ok_or(InsuranceError::ArithmeticOverflow)?;

        // Calculate deadline
        let clock = Clock::get()?;
        let timeout_seconds = if timeout_minutes > 0 {
            timeout_minutes * 60
        } else {
            config.default_timeout
        };
        let deadline = clock.unix_timestamp
            .checked_add(timeout_seconds as i64)
            .ok_or(InsuranceError::ArithmeticOverflow)?;

        // Initialize claim account
        claim.request_commitment = request_commitment;
        claim.client = ctx.accounts.client.key();
        claim.provider = ctx.accounts.provider.key();
        claim.payment_amount = payment_amount;
        claim.locked_amount = locked_amount;
        claim.deadline = deadline;
        claim.status = ClaimStatus::Pending;
        claim.bump = ctx.bumps.claim;

        msg!(
            "Insurance purchased: client={}, provider={}, amount={}, locked={}, deadline={}",
            ctx.accounts.client.key(),
            ctx.accounts.provider.key(),
            payment_amount,
            locked_amount,
            deadline
        );

        Ok(())
    }

    /// Provider confirms service delivery with Ed25519 signature
    pub fn confirm_service(
        ctx: Context<ConfirmService>,
        _request_commitment: [u8; 32],
        signature: [u8; 64],
    ) -> Result<()> {
        let claim = &mut ctx.accounts.claim;
        let provider_bond = &mut ctx.accounts.provider_bond;

        // Check status
        require!(claim.status == ClaimStatus::Pending, InsuranceError::AlreadyConfirmed);

        // Verify Ed25519 signature
        // In production, use solana_program::ed25519_program for verification
        // For now, we trust the provider signature (simplified for MVP)
        // TODO: Implement full Ed25519 verification using instruction introspection

        // In a production implementation, you would:
        // 1. Create an Ed25519 instruction with the signature
        // 2. Verify it in the same transaction
        // 3. Check the signer matches the provider

        msg!("Verifying signature: {:?}", signature);

        // Unlock the bond
        provider_bond.locked_bond = provider_bond.locked_bond
            .checked_sub(claim.locked_amount)
            .ok_or(InsuranceError::ArithmeticOverflow)?;

        // Update status
        claim.status = ClaimStatus::Confirmed;

        msg!(
            "Service confirmed for request {:?}, unlocked {} tokens",
            claim.request_commitment,
            claim.locked_amount
        );

        Ok(())
    }

    /// Client claims insurance after timeout
    pub fn claim_insurance(
        ctx: Context<ClaimInsurance>,
        _request_commitment: [u8; 32],
    ) -> Result<()> {
        let claim = &mut ctx.accounts.claim;
        let provider_bond = &mut ctx.accounts.provider_bond;
        let config = &ctx.accounts.config;

        // Check status
        require!(claim.status == ClaimStatus::Pending, InsuranceError::CannotClaimAfterConfirmation);

        // Check deadline passed
        let clock = Clock::get()?;
        require!(clock.unix_timestamp >= claim.deadline, InsuranceError::DeadlineNotReached);

        // Calculate amounts
        let compensation = claim.payment_amount * 2; // 2x compensation
        let penalty = claim.payment_amount
            .checked_mul(config.platform_penalty_rate as u64)
            .and_then(|v| v.checked_div(10000))
            .ok_or(InsuranceError::ArithmeticOverflow)?;
        let total_deduction = compensation
            .checked_add(penalty)
            .ok_or(InsuranceError::ArithmeticOverflow)?;

        // Deduct from provider bond
        provider_bond.total_bond = provider_bond.total_bond
            .checked_sub(total_deduction)
            .ok_or(InsuranceError::InsufficientBond)?;

        provider_bond.locked_bond = provider_bond.locked_bond
            .checked_sub(claim.locked_amount)
            .ok_or(InsuranceError::ArithmeticOverflow)?;

        // Transfer compensation to client
        let seeds = &[
            b"vault",
            &[ctx.bumps.vault],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.client_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, compensation)?;

        // Transfer penalty to platform treasury
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.platform_treasury_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, penalty)?;

        // Update status
        claim.status = ClaimStatus::Claimed;

        msg!(
            "Insurance claimed: client received {}, platform received {} penalty, provider deducted {}",
            compensation,
            penalty,
            total_deduction
        );

        Ok(())
    }

    /// Provider withdraws available bond
    pub fn withdraw_bond(ctx: Context<WithdrawBond>, amount: u64) -> Result<()> {
        let provider_bond = &mut ctx.accounts.provider_bond;

        // Check available bond
        let available = provider_bond.total_bond
            .checked_sub(provider_bond.locked_bond)
            .ok_or(InsuranceError::InsufficientAvailableBond)?;

        require!(available >= amount, InsuranceError::InsufficientAvailableBond);

        // Deduct from total bond
        provider_bond.total_bond = provider_bond.total_bond
            .checked_sub(amount)
            .ok_or(InsuranceError::ArithmeticOverflow)?;

        // Transfer tokens from vault to provider
        let seeds = &[
            b"vault",
            &[ctx.bumps.vault],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.provider_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, amount)?;

        msg!("Provider {} withdrew {} tokens", ctx.accounts.provider.key(), amount);
        Ok(())
    }
}

// ============================================================================
// Context Structs
// ============================================================================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = InsuranceConfig::LEN,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, InsuranceConfig>,

    /// CHECK: Platform treasury address
    pub platform_treasury: AccountInfo<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DepositBond<'info> {
    #[account(
        init_if_needed,
        payer = provider,
        space = ProviderBond::LEN,
        seeds = [b"provider_bond", provider.key().as_ref()],
        bump
    )]
    pub provider_bond: Account<'info, ProviderBond>,

    #[account(mut)]
    pub provider: Signer<'info>,

    #[account(mut)]
    pub provider_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [b"vault"],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(request_commitment: [u8; 32])]
pub struct PurchaseInsurance<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, InsuranceConfig>,

    #[account(
        mut,
        seeds = [b"provider_bond", provider.key().as_ref()],
        bump = provider_bond.bump
    )]
    pub provider_bond: Account<'info, ProviderBond>,

    #[account(
        init,
        payer = client,
        space = InsuranceClaim::LEN,
        seeds = [b"claim", request_commitment.as_ref()],
        bump
    )]
    pub claim: Account<'info, InsuranceClaim>,

    #[account(mut)]
    pub client: Signer<'info>,

    /// CHECK: Provider address
    pub provider: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(request_commitment: [u8; 32])]
pub struct ConfirmService<'info> {
    #[account(
        mut,
        seeds = [b"claim", request_commitment.as_ref()],
        bump = claim.bump,
        constraint = claim.provider == provider.key()
    )]
    pub claim: Account<'info, InsuranceClaim>,

    #[account(
        mut,
        seeds = [b"provider_bond", provider.key().as_ref()],
        bump = provider_bond.bump
    )]
    pub provider_bond: Account<'info, ProviderBond>,

    pub provider: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(request_commitment: [u8; 32])]
pub struct ClaimInsurance<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, InsuranceConfig>,

    #[account(
        mut,
        seeds = [b"claim", request_commitment.as_ref()],
        bump = claim.bump,
        constraint = claim.client == client.key()
    )]
    pub claim: Account<'info, InsuranceClaim>,

    #[account(
        mut,
        seeds = [b"provider_bond", claim.provider.as_ref()],
        bump = provider_bond.bump
    )]
    pub provider_bond: Account<'info, ProviderBond>,

    #[account(
        mut,
        seeds = [b"vault"],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub client: Signer<'info>,

    #[account(mut)]
    pub client_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub platform_treasury_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct WithdrawBond<'info> {
    #[account(
        mut,
        seeds = [b"provider_bond", provider.key().as_ref()],
        bump = provider_bond.bump,
        constraint = provider_bond.provider == provider.key()
    )]
    pub provider_bond: Account<'info, ProviderBond>,

    #[account(
        mut,
        seeds = [b"vault"],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(mut)]
    pub provider: Signer<'info>,

    #[account(mut)]
    pub provider_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
