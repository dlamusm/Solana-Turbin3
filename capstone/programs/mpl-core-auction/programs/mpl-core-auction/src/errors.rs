use anchor_lang::prelude::*;


#[error_code]
pub enum AuctionErrors {
    #[msg("Only admin can use this instruction!!")]
    InvalidAdmin,
    #[msg("Duration is shorter than the minimum allowed duration!!")]
    DurationTooShort,
    #[msg("Duration is longer than the maximum allowed duration!!")]
    DurationTooLong,
    #[msg("Asset is frozen, thaw first!!")]
    FrozenAsset,
    #[msg("Freeze delegate different from owner, revoke fisrt!!")]
    FreezeDelegateNotOwner,
    #[msg("Transfer delegate different from owner, revoke fisrt!!")]
    TransferDelegateNotOwner,
}