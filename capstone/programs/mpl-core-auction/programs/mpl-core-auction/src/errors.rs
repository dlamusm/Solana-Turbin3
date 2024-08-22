use anchor_lang::prelude::*;


#[error_code]
pub enum AuctionErrors {
    #[msg("Only admin can use this instruction!!")]
    InvalidAdmin,
}