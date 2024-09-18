use anchor_lang::prelude::*;


#[error_code]
pub enum AuctionErrors {
    #[msg("Only admin can use this instruction!!")]
    InvalidAdmin,
    #[msg("Invalid min and max duration!!")]
    InvalidMinMaxDuration,
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
    #[msg("Auction already started, impossible to cancel!!")]
    AuctionStarted,
    #[msg("Auction has ended, impossible to place bid!!")]
    AuctionEnded,
    #[msg("New bid is lower or equal than the current bid!!")]
    InvalidBid,
    #[msg("The owner of the asset can not bid!!")]
    OwnerBid, 
}