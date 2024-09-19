use anchor_lang::prelude::*;

mod state;
mod instructions;
mod errors;

use state::*;
use instructions::*;
use errors::*;


declare_id!("T8Bk6U2jRGNkqDqtvjGvKGqBzvurwx7gTdmag6jQupL");


#[program]
pub mod mpl_core_auction {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, seed: u32, fee_bps: u8, min_duration_minutes: u32, max_duration_minutes: u32) -> Result<()> {
        ctx.accounts.initialize(seed, fee_bps, min_duration_minutes, max_duration_minutes, &ctx.bumps)
    }

    pub fn create_collection_auction(ctx: Context<CreateCollectionAuction>) -> Result<()> {
        ctx.accounts.create_collection_auction(&ctx.bumps)
    }

    pub fn create_asset_auction(ctx: Context<CreateAssetAuction>, duration_minutes: u32, min_bid_lamports: u64) -> Result<()> {
        ctx.accounts.create_asset_auction(duration_minutes, min_bid_lamports, &ctx.bumps)
    }

    pub fn cancel_asset_auction(ctx: Context<CancelAssetAuction>) -> Result<()> {
        ctx.accounts.cancel_asset_auction()
    }

    pub fn bid_asset_auction(ctx: Context<BidAssetAuction>, lamports: u64) -> Result<()> {
        ctx.accounts.bid_asset_auction(lamports)
    }

    pub fn complete_asset_auction(ctx: Context<CompleteAssetAuction>) -> Result<()> {
        ctx.accounts.complete_asset_auction()
    }
}

