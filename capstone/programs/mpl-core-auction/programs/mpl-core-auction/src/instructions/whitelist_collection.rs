use anchor_lang::prelude::*;
use mpl_core::{ID as CORE_PROGRAM_ID, accounts::BaseCollectionV1};

use crate::{Collection, Config, AuctionErrors};

#[derive(Accounts)]
pub struct WhitelistCollection<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [b"config", config.seed.to_le_bytes().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = admin,
        seeds = [b"collection", core_collection.key().as_ref()],
        bump,
        space = 8 + Collection::INIT_SPACE,
    )]
    pub collection: Account<'info, Collection>,
    pub core_collection: Account<'info, BaseCollectionV1>,
    pub system_program: Program<'info, System>,
    /// CHECK: this will be checked by core
    #[account(address = CORE_PROGRAM_ID)]
    pub core_program: UncheckedAccount<'info>,
}


impl<'info> WhitelistCollection<'info> {
    pub fn whitelist_collection(&mut self, bumps: &WhitelistCollectionBumps) -> Result<()> {
        require!(self.admin.key() == self.config.admin, AuctionErrors::InvalidAdmin);
        self.collection.set_inner(Collection{
            core_collection: self.core_collection.key(),
            bump: bumps.collection,
        });
        Ok(())
    }
}