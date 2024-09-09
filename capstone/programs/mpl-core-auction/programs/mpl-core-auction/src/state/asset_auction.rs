use anchor_lang::prelude::*;


#[account]
#[derive(InitSpace)]
pub struct AssetAuction {
    pub collection: Pubkey,
    pub core_asset: Pubkey,
    pub seller: Pubkey,
    pub duration_minutes: u32,
    pub min_bid: u32,
    pub buyer: Option<Pubkey>,
    pub buyer_bid: u32,
    pub first_bid_timestamp: i64,
    pub bump: u8,
}