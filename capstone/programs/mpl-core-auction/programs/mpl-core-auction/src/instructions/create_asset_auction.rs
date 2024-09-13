use anchor_lang::prelude::*;
use mpl_core::{
    accounts::{BaseAssetV1, BaseCollectionV1}, 
    fetch_plugin, 
    instructions::{AddPluginV1CpiBuilder, ApprovePluginAuthorityV1CpiBuilder, UpdatePluginV1CpiBuilder}, 
    types::{FreezeDelegate, Plugin, PluginAuthority, PluginType, TransferDelegate, UpdateAuthority}, ID as CORE_PROGRAM_ID
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
        // duration validations
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

        // check if freeze delegate plugin exists
        match fetch_plugin::<BaseAssetV1, FreezeDelegate>(&self.core_asset.to_account_info(), PluginType::FreezeDelegate) {
             Ok((plugin_authority, freeze_delegate, _)) => {
                // check if asset is frozen or has an active freeze delegate
                require!(freeze_delegate.frozen == false, AuctionErrors::FrozenAsset);
                require!(plugin_authority == PluginAuthority::Owner, AuctionErrors::FreezeDelegateNotOwner);

                // update freeze delegate authority
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
    
        // check if transfer delegate plugin exists
        match fetch_plugin::<BaseAssetV1, TransferDelegate>(&self.core_asset.to_account_info(), PluginType::TransferDelegate) {
            Ok((plugin_authority, _, _)) => {
                // check if asset has active transfer delegate
                require!(plugin_authority == PluginAuthority::Owner, AuctionErrors::TransferDelegateNotOwner);

                // update transfer delegate authority
                ApprovePluginAuthorityV1CpiBuilder::new(&self.core_program.to_account_info())
                    .asset(&self.core_asset.to_account_info())
                    .collection(Some(&self.core_collection.to_account_info()))
                    .payer(&self.seller.to_account_info())
                    .authority(Some(&self.seller.to_account_info()))
                    .system_program(&self.system_program.to_account_info())
                    .plugin_type(PluginType::TransferDelegate)
                    .new_authority(PluginAuthority::Address { address: self.asset_auction.key() })
                    .invoke()?;
            }
            Err(_) => {
                // Add transfer delegate
                AddPluginV1CpiBuilder::new(&self.core_program.to_account_info())
                    .asset(&self.core_asset.to_account_info())
                    .collection(Some(&self.core_collection.to_account_info()))
                    .payer(&self.seller.to_account_info())
                    .authority(Some(&self.seller.to_account_info()))
                    .system_program(&self.system_program.to_account_info())
                    .plugin(Plugin::TransferDelegate( TransferDelegate { } ))
                    .init_authority(PluginAuthority::Address { address: self.asset_auction.key() })
                    .invoke()?;
            }
        };

        Ok(())
    }

}