use anchor_lang::prelude::*;


#[account]
#[derive(InitSpace)]
pub struct AssetAuction {
    pub collection: Pubkey,
    pub core_asset: Pubkey,
    pub owner: Pubkey,
    pub duration_minutes: u32,
    pub min_bid_lamports: u64,
    pub buyer: Pubkey,
    pub buyer_bid_lamports: u64,
    pub first_bid_timestamp: i64,
    pub bump: u8,
}