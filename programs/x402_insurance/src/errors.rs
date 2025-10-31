use anchor_lang::prelude::*;

#[error_code]
pub enum InsuranceError {
    #[msg("Insufficient bond to lock")]
    InsufficientBond,

    #[msg("Insurance already exists for this request")]
    InsuranceAlreadyExists,

    #[msg("Insurance not found")]
    InsuranceNotFound,

    #[msg("Service already confirmed")]
    AlreadyConfirmed,

    #[msg("Cannot claim insurance before deadline")]
    DeadlineNotReached,

    #[msg("Insurance already claimed")]
    AlreadyClaimed,

    #[msg("Invalid signature")]
    InvalidSignature,

    #[msg("Provider is liquidated")]
    ProviderLiquidated,

    #[msg("Insufficient available bond to withdraw")]
    InsufficientAvailableBond,

    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,

    #[msg("Cannot claim after service confirmation")]
    CannotClaimAfterConfirmation,

    #[msg("Provider is not undercollateralized")]
    ProviderNotUndercollateralized,

    #[msg("Grace period has not expired yet")]
    GracePeriodNotExpired,
}
