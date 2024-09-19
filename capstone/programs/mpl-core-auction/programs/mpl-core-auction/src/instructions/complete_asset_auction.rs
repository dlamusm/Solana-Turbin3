use anchor_lang::prelude::*;
use anchor_lang::solana_program::{system_instruction::transfer, program::invoke_signed};
use mpl_core::{
    accounts::{BaseAssetV1, BaseCollectionV1}, 
    instructions::{UpdatePluginV1CpiBuilder, TransferV1CpiBuilder},
    types::{Plugin, FreezeDelegate},
    ID as CORE_PROGRAM_ID
};



use crate::{AssetAuction, AuctionErrors, CollectionAuction, Config};


#[derive(Accounts)]
pub struct CompleteAssetAuction<'info> {
    // EXTERNAL ACCOUNTS
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub owner: SystemAccount<'info>,
    #[account(mut)]
    pub buyer: SystemAccount<'info>,
    #[account(mut)]
    pub collection: Account<'info, BaseCollectionV1>,
    #[account(
        mut,
        has_one = owner,
    )]
    pub asset: Account<'info, BaseAssetV1>,

    // INTERNAL ACCOUNTS
    #[account(
        seeds = [b"config", config.seed.to_le_bytes().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [b"tresuary", config.key().as_ref()],
        bump = config.tresuary_bump,
    )]
    pub tresuary: SystemAccount<'info>,
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
        close = owner,
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

impl<'info> CompleteAssetAuction<'info> {
    pub fn complete_asset_auction(&mut self) -> Result<()> {
        // validate auction has started
        require!(self.asset_auction.first_bid_timestamp != 0, AuctionErrors::AuctionNotStarted);

        // validate auction is over
        let unix_timestamp = Clock::get()?.unix_timestamp;
        let duration_minutes: i64 = (unix_timestamp - self.asset_auction.first_bid_timestamp) / 60;
        require!(duration_minutes >= self.asset_auction.duration_minutes as i64, AuctionErrors::AuctionRunning);

        // calculate owner and vault lamprots
        let fee_decimal = (self.config.fee_bps as f64) / 10_000_f64;
        let buyer_bid_lamports = self.asset_auction.buyer_bid_lamports as f64;
        let treusary_lamports = (buyer_bid_lamports * fee_decimal).ceil() as u64;
        let owner_lamports = (buyer_bid_lamports * (1.0 - fee_decimal)).floor()  as u64;

        // transfer sol signer seeds
        let transfer_sol_signer_seeds: [&[&[u8]]; 1] = [&[
            b"vault",
            self.config.to_account_info().key.as_ref(),
            &[self.config.vault_bump],
        ]];
        
        // transfer fee to tresuary 
        let ix = transfer(
            &self.vault.key(),
            &self.tresuary.key(),
            treusary_lamports,
        );

        invoke_signed(
            &ix,
            &[
                self.vault.to_account_info(),
                self.tresuary.to_account_info(),
            ],
            &transfer_sol_signer_seeds,
        )?;

        // Transfer funds to owner
        let ix = transfer(
            &self.vault.key(),
            &self.owner.key(),
            owner_lamports,
        );

        invoke_signed(
            &ix,
            &[
                self.vault.to_account_info(),
                self.owner.to_account_info(),
            ],
            &transfer_sol_signer_seeds,
        )?;

        // modify asset signer seeds
        let modify_asset_signer_seeds: [&[&[u8]]; 1] = [&[
            self.collection_auction.to_account_info().key.as_ref(),
            self.asset.to_account_info().key.as_ref(),
            &[self.asset_auction.bump],
        ]];

        // thaw asset
        UpdatePluginV1CpiBuilder::new(&self.core_program.to_account_info())
            .asset(&self.asset.to_account_info())
            .collection(Some(&self.collection.to_account_info()))
            .payer(&self.payer.to_account_info())
            .authority(Some(&self.asset_auction.to_account_info()))
            .system_program(&self.system_program.to_account_info())
            .plugin(Plugin::FreezeDelegate( FreezeDelegate { frozen: false } ))
            .invoke_signed(&modify_asset_signer_seeds)?;

        // transfer asset to owner
        TransferV1CpiBuilder::new(&self.core_program.to_account_info())
            .asset(&self.asset.to_account_info())
            .collection(Some(&self.collection.to_account_info()))
            .payer(&self.payer.to_account_info())
            .authority(Some(&self.asset_auction.to_account_info()))
            .new_owner(&self.buyer.to_account_info())
            .system_program(Some(&self.system_program.to_account_info()))
            .invoke_signed(&modify_asset_signer_seeds)?;

        Ok(())
    }
}