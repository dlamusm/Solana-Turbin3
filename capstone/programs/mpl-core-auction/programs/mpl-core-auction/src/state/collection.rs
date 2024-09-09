use anchor_lang::prelude::*;


#[account]
#[derive(InitSpace)]
pub struct Collection {
    pub core_collection: Pubkey,
    pub bump: u8,
}
