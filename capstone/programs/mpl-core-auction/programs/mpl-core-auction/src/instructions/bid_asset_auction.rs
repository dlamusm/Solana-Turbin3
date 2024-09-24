use anchor_lang::prelude::*;
use anchor_lang::solana_program::{system_instruction::transfer, program::{invoke_signed, invoke}};
use mpl_core::{
    accounts::{BaseAssetV1, BaseCollectionV1}, 
    ID as CORE_PROGRAM_ID
};

use crate::{AssetAuction, AuctionErrors, CollectionAuction, Config};


#[derive(Accounts)]
pub struct BidAssetAuction<'info> {
    // EXTERNAL ACCOUNTS
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: No signature or program ownership needed
    pub buyer: UncheckedAccount<'info>,
    /// CHECK: No signature or program ownership needed
    #[account(
        mut,
        address = asset_auction.buyer,
    )]
    pub previous_buyer: UncheckedAccount<'info>,
    pub collection: Account<'info, BaseCollectionV1>,
    pub asset: Account<'info, BaseAssetV1>,

    // INTERNAL ACCOUNTS
    #[account(
        seeds = [b"config", config.seed.to_le_bytes().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"vault", config.key().as_ref()],
        bump = config.vault_bump,
    )]
    pub vault: SystemAccount<'info>,
    #[account(
        seeds = [b"collection", config.key().as_ref(), collection.key().as_ref()],
        bump = collection_auction.bump,
    )]
    pub collection_auction: Account<'info, CollectionAuction>,
    #[account(
        mut,
        seeds = [collection_auction.key().as_ref(), asset.key().as_ref()],
        bump = asset_auction.bump,
    )]
    pub asset_auction: Account<'info, AssetAuction>,

    // PROGRAMS
    pub system_program: Program<'info, System>,
    /// CHECK: this will be checked by core
    #[account(address = CORE_PROGRAM_ID)]
    pub core_program: UncheckedAccount<'info>,
}

impl<'info> BidAssetAuction<'info> {
    pub fn bid_asset_auction(&mut self, lamports: u64) -> Result<()> {
        require!(self.buyer.key() != self.asset_auction.owner, AuctionErrors::OwnerBid);
        require!(self.payer.key() != self.asset_auction.owner, AuctionErrors::OwnerBid);
        require!(lamports > self.asset_auction.buyer_bid_lamports, AuctionErrors::InvalidBid);

        // seconds
        let unix_timestamp = Clock::get()?.unix_timestamp;

        // check if previous bid exists
        match self.asset_auction.first_bid_timestamp {
            // no previous auction
            0 => {
                self.asset_auction.first_bid_timestamp = unix_timestamp;
            }
            // previous auction
            _ => { 
                // check that auction is not over
                let duration_minutes: i64 = (unix_timestamp - self.asset_auction.first_bid_timestamp) / 60;
                require!(duration_minutes < self.asset_auction.duration_minutes as i64, AuctionErrors::AuctionEnded);

                // transfer funds to previous buyer
                let ix = transfer(
                    &self.vault.key(),
                    &self.previous_buyer.key(),
                    self.asset_auction.buyer_bid_lamports,
                );
        
                let signer_seeds: [&[&[u8]]; 1] = [&[
                    b"vault",
                    self.config.to_account_info().key.as_ref(),
                    &[self.config.vault_bump],
                ]];
        
                invoke_signed(
                    &ix,
                    &[
                        self.vault.to_account_info(),
                        self.previous_buyer.to_account_info(),
                    ],
                    &signer_seeds,
                )?;

            }
        };
        
        // transfer new bid funds to vault
        let ix = transfer(
            &self.payer.key(),
            &self.vault.key(),
            lamports,
        );

        invoke(
            &ix,
            &[
                self.payer.to_account_info(),
                self.vault.to_account_info(),
            ],
        )?;

        // update buyer
        self.asset_auction.buyer = self.buyer.key();
        self.asset_auction.buyer_bid_lamports = lamports;

        Ok(())
    }
}