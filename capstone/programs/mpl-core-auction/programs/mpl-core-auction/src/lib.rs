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

    pub fn whitelist_collection(ctx: Context<WhitelistCollection>) -> Result<()> {
        ctx.accounts.whitelist_collection(&ctx.bumps)
    }

    pub fn create_asset_auction(ctx: Context<CreateAssetAuction>, duration_minutes: u32, min_bid: u32) -> Result<()> {
        ctx.accounts.create_asset_auction(duration_minutes, min_bid, &ctx.bumps)
    }
}

