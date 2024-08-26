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

    pub fn initialize(ctx: Context<Initialize>, fee_bps: u8, min_duration_min: u32, max_duration_min: u32) -> Result<()> {
        ctx.accounts.initialize(fee_bps, min_duration_min, max_duration_min, &ctx.bumps)
    }
}

