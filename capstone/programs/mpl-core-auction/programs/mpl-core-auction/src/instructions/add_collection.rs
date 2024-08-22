use anchor_lang::prelude::*;
use mpl_core::{ID as CORE_PROGRAM_ID, accounts::BaseCollectionV1};

use crate::{AuctionCollection, AuctionConfig, AuctionErrors};

#[derive(Accounts)]
pub struct AddAuctionCollection<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        seeds = [b"auction_config"],
        bump = auction_config.bump,
    )]
    pub auction_config: Account<'info, AuctionConfig>,
    #[account(
        init,
        payer = admin,
        seeds = [b"auction_collection", collection.key().as_ref()],
        bump,
        space = 8 + AuctionCollection::INIT_SPACE,
    )]
    pub auction_collection: Account<'info, AuctionCollection>,
    pub collection: Account<'info, BaseCollectionV1>,
    pub system_program: Program<'info, System>,
    #[account(address = CORE_PROGRAM_ID)]
    pub core_program: UncheckedAccount<'info>,
}


impl<'info> AddAuctionCollection<'info> {
    pub fn add_collection(&mut self, bumps: &AddAuctionCollectionBumps) -> Result<()> {
        require!(self.admin.key() == self.auction_config.admin, AuctionErrors::InvalidAdmin);
        self.auction_collection.set_inner(AuctionCollection{
            collection: self.collection.key(),
            bump: bumps.auction_collection,
        });
        Ok(())
    }
}