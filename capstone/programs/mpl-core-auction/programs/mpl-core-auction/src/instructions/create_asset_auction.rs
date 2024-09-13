use anchor_lang::prelude::*;
use mpl_core::{
    ID as CORE_PROGRAM_ID,
    fetch_plugin,
    accounts::{BaseCollectionV1, BaseAssetV1},
    types::{FreezeDelegate, UpdateAuthority, PluginType, PluginAuthority, Plugin},
    instructions::{AddPluginV1CpiBuilder, UpdatePluginV1CpiBuilder, ApprovePluginAuthorityV1CpiBuilder}
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
    #[account(mut)]
    pub core_collection: Account<'info, BaseCollectionV1>,
    #[account(
        mut,
        constraint = core_asset.owner == seller.key(),
        constraint = core_asset.update_authority == UpdateAuthority::Collection(core_collection.key()),
    )]
    pub core_asset: Account<'info, BaseAssetV1>,
    #[account(
        init,
        payer = seller,
        seeds = [collection.key().as_ref(), core_asset.key().as_ref()],
        bump,
        space = 8 + AssetAuction::INIT_SPACE
    )]
    pub asset_auction: Account<'info, AssetAuction>,
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
        self.asset_auction.set_inner(
            AssetAuction {
                collection: self.collection.key(),
                core_asset: self.core_asset.key(),
                seller: self.seller.key(),
                duration_minutes,
                min_bid,
                buyer: None,
                buyer_bid: 0,
                first_bid_timestamp: 0,
                bump: bumps.asset_auction,
            }
        );

        // check if plugin exists
        match fetch_plugin::<BaseAssetV1, FreezeDelegate>(&self.core_asset.to_account_info(), PluginType::FreezeDelegate) {
             Ok((_, fetched_freeze_delegate, _)) => {
                // check if asset is frozen
                require!(fetched_freeze_delegate.frozen == false, AuctionErrors::FrozenAsset);

                // update authority
                ApprovePluginAuthorityV1CpiBuilder::new(&self.core_program.to_account_info())
                    .asset(&self.core_asset.to_account_info())
                    .collection(Some(&self.core_collection.to_account_info()))
                    .payer(&self.seller.to_account_info())
                    .authority(Some(&self.seller.to_account_info()))
                    .system_program(&self.system_program.to_account_info())
                    .plugin_type(PluginType::FreezeDelegate)
                    .new_authority(PluginAuthority::Address { address: self.asset_auction.key() })
                    .invoke()?;

                // freeze with asset auction pda seeds signature
                let signer_seeds: [&[&[u8]]; 1] = [&[
                    self.collection.to_account_info().key.as_ref(),
                    self.core_asset.to_account_info().key.as_ref(),
                    &[self.asset_auction.bump],
                ]];

                UpdatePluginV1CpiBuilder::new(&self.core_program.to_account_info())
                    .asset(&self.core_asset.to_account_info())
                    .collection(Some(&self.core_collection.to_account_info()))
                    .payer(&self.seller.to_account_info())
                    .authority(Some(&self.asset_auction.to_account_info()))
                    .system_program(&self.system_program.to_account_info())
                    .plugin(Plugin::FreezeDelegate( FreezeDelegate { frozen: true } ))
                    .invoke_signed(&signer_seeds)?;
                
             }
             Err(_) => {
                // Freeze the asset
                AddPluginV1CpiBuilder::new(&self.core_program.to_account_info())
                    .asset(&self.core_asset.to_account_info())
                    .collection(Some(&self.core_collection.to_account_info()))
                    .payer(&self.seller.to_account_info())
                    .authority(Some(&self.seller.to_account_info()))
                    .system_program(&self.system_program.to_account_info())
                    .plugin(Plugin::FreezeDelegate( FreezeDelegate { frozen: true } ))
                    .init_authority(PluginAuthority::Address { address: self.asset_auction.key() })
                    .invoke()?;

             }
        };
    

        
        // Add transfer delegate


        Ok(())
    }

}