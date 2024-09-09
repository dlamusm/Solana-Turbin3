use anchor_lang::{accounts::signer, prelude::*, solana_program::program::invoke_signed};
use mpl_core::{
    ID as CORE_PROGRAM_ID,
    fetch_plugin,
    accounts::{BaseCollectionV1, BaseAssetV1},
    types::{FreezeDelegate, UpdateAuthority, PluginType, PluginAuthority, Plugin},
    instructions::AddPluginV1CpiBuilder
};



use crate::{Collection, Config, AssetAuction, AuctionErrors};


#[derive(Accounts)]
pub struct CreateAssetAuction<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        seeds = [b"config", config.seed.to_le_bytes().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        seeds = [b"collection", core_collection.key().as_ref()],
        bump = collection.bump,
    )]
    pub collection: Account<'info, Collection>,
    pub core_collection: Account<'info, BaseCollectionV1>,
    #[account(
        mut,
        constraint = core_asset.owner == seller.key(),
        constraint = core_asset.update_authority == UpdateAuthority::Collection(collection.key()),
    )]
    pub core_asset: Account<'info, BaseAssetV1>,
    #[account(
        init,
        payer = seller,
        seeds = [collection.key().as_ref(), core_asset.key().as_ref()],
        bump,
        space = 8 + AssetAuction::INIT_SPACE
    )]
    pub auction_nft: Account<'info, AssetAuction>,
    pub system_program: Program<'info, System>,
    /// CHECK: this will be checked by core
    #[account(address = CORE_PROGRAM_ID)]
    pub core_program: UncheckedAccount<'info>,
}

impl<'info> CreateAssetAuction<'info> {
    pub fn create_asset_auction(&mut self, duration_minutes: u32, min_bid: u32, bumps: &CreateAssetAuctionBumps) -> Result<()> {
        
        // validations
        require!(duration_minutes >= self.config.min_duration_minutes, AuctionErrors::DurationTooShort);
        require!(duration_minutes <= self.config.max_duration_minutes, AuctionErrors::DurationTooLong);

        
        // create data account
        self.auction_nft.set_inner(
            AssetAuction {
                collection: self.collection.key(),
                core_asset: self.core_asset.key(),
                seller: self.seller.key(),
                duration_minutes,
                min_bid,
                buyer: None,
                buyer_bid: 0,
                first_bid_timestamp: 0,
                bump: bumps.auction_nft,
            }
        );

        // check if asset is frozen freeze
        match fetch_plugin::<BaseAssetV1, FreezeDelegate>(&self.core_asset.to_account_info(), PluginType::FreezeDelegate) {
            Ok((_, fetched_freeze_delegate, _)) => {
                require!(fetched_freeze_delegate.frozen == false, AuctionErrors::FrozenAsset);
            }
            Err(_) => {}
        };
    
        // Freeze the asset  
        AddPluginV1CpiBuilder::new(&self.core_program.to_account_info())
            .asset(&self.core_asset.to_account_info())
            .payer(&self.seller.to_account_info())
            .authority(Some(&self.seller.to_account_info()))
            .plugin(Plugin::FreezeDelegate( FreezeDelegate{ frozen: true } ))
            .init_authority(PluginAuthority::Address { address: self.auction_nft.key() })
            .invoke()?;
        
        // Add transfer delegate


        Ok(())
    }

}