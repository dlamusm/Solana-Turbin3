use anchor_lang::prelude::*;


#[account]
#[derive(InitSpace)]
pub struct CollectionAuction {
    pub collection: Pubkey,
    pub bump: u8,
}
