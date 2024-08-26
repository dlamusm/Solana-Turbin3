use anchor_lang::prelude::*;


#[account]
#[derive(InitSpace)]
pub struct AuctionConfig {
    pub admin: Pubkey,
    pub fee_bps: u8,
    pub min_duration_min: u32,
    pub max_duration_min: u32,
    pub tresuary_bump: u8,
    pub vault_bump: u8,
    pub bump: u8,
}