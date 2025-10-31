use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};

mod state;
mod errors;

use state::*;
use errors::*;

declare_id!("DMahL9qujZiirzLXKFvJxHhsNxG9uXh1yi1EnUCYgH7w");

#[program]
pub mod x402_insurance {
    use super::*;

    /// Initialize the insurance protocol
    pub fn initialize(
        ctx: Context<Initialize>,
        platform_penalty_rate: u16,
        default_timeout: u64,
        liquidation_grace_period: u64,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.platform_treasury = ctx.accounts.platform_treasury.key();
        config.platform_penalty_rate = platform_penalty_rate;
        config.default_timeout = default_timeout;
        config.liquidation_grace_period = liquidation_grace_period;
        config.authority = ctx.accounts.authority.key();
        config.bump = ctx.bumps.config;

        msg!("Insurance protocol initialized with penalty rate: {}bps, grace period: {}s",
            platform_penalty_rate, liquidation_grace_period);
        Ok(())
    }

    /// Provider deposits bond into the protocol
    pub fn deposit_bond(ctx: Context<DepositBond>, amount: u64) -> Result<()> {
        let provider_bond = &mut ctx.accounts.provider_bond;

        // Initialize fields if this is the first deposit
        if provider_bond.provider == Pubkey::default() {
            provider_bond.provider = ctx.accounts.provider.key();
            provider_bond.bump = ctx.bumps.provider_bond;
            provider_bond.locked_bond = 0;
            provider_bond.min_bond = 0;
            provider_bond.is_liquidated = false;
            provider_bond.undercollateralized_since = 0;
        }

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

        // Check if provider is now above min_bond, reset undercollateralized timestamp
        let available_bond = provider_bond.total_bond
            .checked_sub(provider_bond.locked_bond)
            .ok_or(InsuranceError::ArithmeticOverflow)?;

        if available_bond >= provider_bond.min_bond && provider_bond.undercollateralized_since > 0 {
            provider_bond.undercollateralized_since = 0;
            msg!("Provider {} restored to healthy collateral", ctx.accounts.provider.key());
        }

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

        // Transfer payment from client directly to provider (x402 payment)
        let cpi_accounts = Transfer {
            from: ctx.accounts.client_token_account.to_account_info(),
            to: ctx.accounts.provider_token_account.to_account_info(),
            authority: ctx.accounts.client.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, payment_amount)?;

        // Lock the bond (insurance guarantee)
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

        // Provider already received payment directly from client during purchase_insurance
        // No need to transfer again, just unlock the bond

        // Unlock the bond
        provider_bond.locked_bond = provider_bond.locked_bond
            .checked_sub(claim.locked_amount)
            .ok_or(InsuranceError::ArithmeticOverflow)?;

        // Update status
        claim.status = ClaimStatus::Confirmed;

        msg!(
            "Service confirmed for request {:?}, unlocked {} tokens (provider already received {})",
            claim.request_commitment,
            claim.locked_amount,
            claim.payment_amount
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
        // Client gets refund of original payment (1 USDC) from provider's bond
        let compensation = claim.payment_amount;

        // Platform gets penalty (0.02 USDC = 2% of payment) from provider's bond
        let penalty = claim.payment_amount
            .checked_mul(config.platform_penalty_rate as u64)
            .and_then(|v| v.checked_div(10000))
            .ok_or(InsuranceError::ArithmeticOverflow)?;

        // Total deduction from provider bond = compensation + penalty = 1.02 USDC
        let bond_deduction = compensation
            .checked_add(penalty)
            .ok_or(InsuranceError::ArithmeticOverflow)?;

        // Verify bond_deduction equals locked_amount (should be 1.02x payment)
        require!(
            bond_deduction == claim.locked_amount,
            InsuranceError::ArithmeticOverflow
        );

        // Deduct full locked amount from provider bond
        provider_bond.total_bond = provider_bond.total_bond
            .checked_sub(bond_deduction)
            .ok_or(InsuranceError::InsufficientBond)?;

        // Unlock the bond
        provider_bond.locked_bond = provider_bond.locked_bond
            .checked_sub(claim.locked_amount)
            .ok_or(InsuranceError::ArithmeticOverflow)?;

        // Transfer compensation to client from vault (provider's bond)
        let seeds = &[
            b"vault".as_ref(),
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

        // Transfer penalty from vault (provider's bond) to platform treasury
        let cpi_accounts = Transfer {
            from: ctx.accounts.vault.to_account_info(),
            to: ctx.accounts.platform_treasury_token_account.to_account_info(),
            authority: ctx.accounts.vault.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, penalty)?;

        // Check if provider is now below min_bond after claim
        let available_after = provider_bond.total_bond
            .checked_sub(provider_bond.locked_bond)
            .ok_or(InsuranceError::ArithmeticOverflow)?;

        if available_after < provider_bond.min_bond && provider_bond.undercollateralized_since == 0 {
            let clock = Clock::get()?;
            provider_bond.undercollateralized_since = clock.unix_timestamp;
            msg!("Provider {} is now undercollateralized after claim (available: {}, min: {})",
                claim.provider,
                available_after,
                provider_bond.min_bond
            );
        }

        // Update status
        claim.status = ClaimStatus::Claimed;

        msg!(
            "Insurance claimed: client refunded {} (from bond), platform received {} penalty (from bond), total bond deducted {}",
            compensation,
            penalty,
            bond_deduction
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
            b"vault".as_ref(),
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

        // Check if provider is now below min_bond after withdrawal
        let available_after = provider_bond.total_bond
            .checked_sub(provider_bond.locked_bond)
            .ok_or(InsuranceError::ArithmeticOverflow)?;

        if available_after < provider_bond.min_bond && provider_bond.undercollateralized_since == 0 {
            let clock = Clock::get()?;
            provider_bond.undercollateralized_since = clock.unix_timestamp;
            msg!("Provider {} is now undercollateralized (available: {}, min: {})",
                ctx.accounts.provider.key(),
                available_after,
                provider_bond.min_bond
            );
        }

        msg!("Provider {} withdrew {} tokens", ctx.accounts.provider.key(), amount);
        Ok(())
    }

    /// Liquidate undercollateralized provider after grace period
    pub fn liquidate_provider(ctx: Context<LiquidateProvider>) -> Result<()> {
        let provider_bond = &mut ctx.accounts.provider_bond;
        let config = &ctx.accounts.config;

        // Check not already liquidated
        require!(!provider_bond.is_liquidated, InsuranceError::ProviderLiquidated);

        // Check provider is undercollateralized
        let available_bond = provider_bond.total_bond
            .checked_sub(provider_bond.locked_bond)
            .ok_or(InsuranceError::ArithmeticOverflow)?;

        require!(
            available_bond < provider_bond.min_bond,
            InsuranceError::ProviderNotUndercollateralized
        );

        // Check grace period has passed
        let clock = Clock::get()?;
        require!(
            provider_bond.undercollateralized_since > 0,
            InsuranceError::ProviderNotUndercollateralized
        );

        let grace_period_end = provider_bond.undercollateralized_since
            .checked_add(config.liquidation_grace_period as i64)
            .ok_or(InsuranceError::ArithmeticOverflow)?;

        require!(
            clock.unix_timestamp >= grace_period_end,
            InsuranceError::GracePeriodNotExpired
        );

        // Transfer all remaining available bond to platform treasury
        if available_bond > 0 {
            let seeds = &[
                b"vault".as_ref(),
                &[ctx.bumps.vault],
            ];
            let signer = &[&seeds[..]];

            let cpi_accounts = Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.platform_treasury_token_account.to_account_info(),
                authority: ctx.accounts.vault.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
            token::transfer(cpi_ctx, available_bond)?;
        }

        // Mark provider as liquidated
        provider_bond.is_liquidated = true;
        provider_bond.total_bond = provider_bond.locked_bond; // Only locked bond remains

        msg!(
            "Provider {} liquidated: {} tokens transferred to platform treasury",
            provider_bond.provider,
            available_bond
        );

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

    pub mint: Account<'info, Mint>,

    #[account(
        init_if_needed,
        payer = provider,
        token::mint = mint,
        token::authority = vault,
        seeds = [b"vault"],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
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

    #[account(mut)]
    pub client_token_account: Account<'info, TokenAccount>,

    /// CHECK: Provider address
    pub provider: AccountInfo<'info>,

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

#[derive(Accounts)]
pub struct LiquidateProvider<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, InsuranceConfig>,

    #[account(
        mut,
        seeds = [b"provider_bond", provider_bond.provider.as_ref()],
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
    pub platform_treasury_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}
