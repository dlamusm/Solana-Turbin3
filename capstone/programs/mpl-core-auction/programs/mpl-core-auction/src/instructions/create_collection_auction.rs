use anchor_lang::prelude::*;
use mpl_core::{ID as CORE_PROGRAM_ID, accounts::BaseCollectionV1};

use crate::{CollectionAuction, Config, AuctionErrors};

#[derive(Accounts)]
pub struct CreateCollectionAuction<'info> {
    // EXTERNAL ACCOUNTS
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub collection: Account<'info, BaseCollectionV1>,

    // INTERNAL ACCOUNTS   
    #[account(
        seeds = [b"config", config.seed.to_le_bytes().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = payer,
        seeds = [b"collection", config.key().as_ref(), collection.key().as_ref()],
        bump,
        space = 8 + CollectionAuction::INIT_SPACE,
    )]
    pub collection_auction: Account<'info, CollectionAuction>,

    // PROGRAMS
    pub system_program: Program<'info, System>,
    /// CHECK: this will be checked by core
    #[account(address = CORE_PROGRAM_ID)]
    pub core_program: UncheckedAccount<'info>,
}


impl<'info> CreateCollectionAuction<'info> {
    pub fn create_collection_auction(&mut self, bumps: &CreateCollectionAuctionBumps) -> Result<()> {
        require!(self.admin.key() == self.config.admin, AuctionErrors::InvalidAdmin);
        self.collection_auction.set_inner( CollectionAuction {
            collection: self.collection.key(),
            bump: bumps.collection_auction,
        });
        Ok(())
    }
}