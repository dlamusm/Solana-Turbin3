use anchor_lang::prelude::*;


#[account]
#[derive(InitSpace)]
pub struct AuctionCollection {
    pub collection: Pubkey,
    pub bump: u8,
}
