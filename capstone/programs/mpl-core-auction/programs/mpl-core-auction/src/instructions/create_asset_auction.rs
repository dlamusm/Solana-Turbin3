use anchor_lang::prelude::*;
use mpl_core::{
    accounts::{BaseAssetV1, BaseCollectionV1}, 
    fetch_plugin, 
    instructions::{AddPluginV1CpiBuilder, ApprovePluginAuthorityV1CpiBuilder, UpdatePluginV1CpiBuilder}, 
    types::{FreezeDelegate, Plugin, PluginAuthority, PluginType, TransferDelegate, UpdateAuthority},
    ID as CORE_PROGRAM_ID
};

use crate::{CollectionAuction, Config, AssetAuction, AuctionErrors};


#[derive(Accounts)]
pub struct CreateAssetAuction<'info> {
    // EXTERNAL ACCOUNTS
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(mut)]
    pub collection: Account<'info, BaseCollectionV1>,
    #[account(
        mut,
        has_one = owner,
        constraint = asset.update_authority == UpdateAuthority::Collection(collection.key()),
    )]
    pub asset: Account<'info, BaseAssetV1>,

    // INTERNAL ACCOUNTS   
    #[account(
        seeds = [b"config", config.seed.to_le_bytes().as_ref()],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
    #[account(
        seeds = [b"collection", config.key().as_ref(), collection.key().as_ref()],
        bump = collection_auction.bump,
    )]
    pub collection_auction: Account<'info, CollectionAuction>,
    #[account(
        init,
        payer = payer,
        seeds = [collection_auction.key().as_ref(), asset.key().as_ref()],
        bump,
        space = 8 + AssetAuction::INIT_SPACE
    )]
    pub asset_auction: Account<'info, AssetAuction>,

    // PROGRAMS
    pub system_program: Program<'info, System>,
    /// CHECK: this will be checked by core
    #[account(address = CORE_PROGRAM_ID)]
    pub core_program: UncheckedAccount<'info>,
}

impl<'info> CreateAssetAuction<'info> {
    pub fn create_asset_auction(&mut self, duration_minutes: u32, min_bid_lamports: u64, bumps: &CreateAssetAuctionBumps) -> Result<()> {
        // duration validations
        require!(duration_minutes >= self.config.min_duration_minutes, AuctionErrors::DurationTooShort);
        require!(duration_minutes <= self.config.max_duration_minutes, AuctionErrors::DurationTooLong);

        // create data account
        self.asset_auction.set_inner(
            AssetAuction {
                collection: self.collection.key(),
                core_asset: self.asset.key(),
                owner: self.owner.key(),
                duration_minutes,
                min_bid_lamports,
                buyer: self.owner.key(), // owner can not bid, it starts as incial buyer instead of using None
                buyer_bid_lamports: 0,
                first_bid_timestamp: 0,
                bump: bumps.asset_auction,
            }
        );

        // check if freeze delegate plugin exists
        match fetch_plugin::<BaseAssetV1, FreezeDelegate>(&self.asset.to_account_info(), PluginType::FreezeDelegate) {
            Ok((plugin_authority, freeze_delegate, _)) => {
                // check if asset is frozen or has an active freeze delegate
                require!(freeze_delegate.frozen == false, AuctionErrors::FrozenAsset);
                require!(plugin_authority == PluginAuthority::Owner, AuctionErrors::FreezeDelegateNotOwner);

                // update freeze delegate authority
                ApprovePluginAuthorityV1CpiBuilder::new(&self.core_program.to_account_info())
                    .asset(&self.asset.to_account_info())
                    .collection(Some(&self.collection.to_account_info()))
                    .payer(&self.payer.to_account_info())
                    .authority(Some(&self.owner.to_account_info()))
                    .system_program(&self.system_program.to_account_info())
                    .plugin_type(PluginType::FreezeDelegate)
                    .new_authority(PluginAuthority::Address { address: self.asset_auction.key() })
                    .invoke()?;

                // freeze with asset auction pda seeds signature
                let signer_seeds: [&[&[u8]]; 1] = [&[
                    self.collection_auction.to_account_info().key.as_ref(),
                    self.asset.to_account_info().key.as_ref(),
                    &[self.asset_auction.bump],
                ]];

                UpdatePluginV1CpiBuilder::new(&self.core_program.to_account_info())
                    .asset(&self.asset.to_account_info())
                    .collection(Some(&self.collection.to_account_info()))
                    .payer(&self.payer.to_account_info())
                    .authority(Some(&self.asset_auction.to_account_info()))
                    .system_program(&self.system_program.to_account_info())
                    .plugin(Plugin::FreezeDelegate( FreezeDelegate { frozen: true } ))
                    .invoke_signed(&signer_seeds)?;
                
            }
            Err(_) => {
                // Freeze the asset
                AddPluginV1CpiBuilder::new(&self.core_program.to_account_info())
                    .asset(&self.asset.to_account_info())
                    .collection(Some(&self.collection.to_account_info()))
                    .payer(&self.payer.to_account_info())
                    .authority(Some(&self.owner.to_account_info()))
                    .system_program(&self.system_program.to_account_info())
                    .plugin(Plugin::FreezeDelegate( FreezeDelegate { frozen: true } ))
                    .init_authority(PluginAuthority::Address { address: self.asset_auction.key() })
                    .invoke()?;
            
            }
        };
    
        // check if transfer delegate plugin exists
        match fetch_plugin::<BaseAssetV1, TransferDelegate>(&self.asset.to_account_info(), PluginType::TransferDelegate) {
            Ok((plugin_authority, _, _)) => {
                // check if asset has active transfer delegate
                require!(plugin_authority == PluginAuthority::Owner, AuctionErrors::TransferDelegateNotOwner);

                // update transfer delegate authority
                ApprovePluginAuthorityV1CpiBuilder::new(&self.core_program.to_account_info())
                    .asset(&self.asset.to_account_info())
                    .collection(Some(&self.collection.to_account_info()))
                    .payer(&self.payer.to_account_info())
                    .authority(Some(&self.owner.to_account_info()))
                    .system_program(&self.system_program.to_account_info())
                    .plugin_type(PluginType::TransferDelegate)
                    .new_authority(PluginAuthority::Address { address: self.asset_auction.key() })
                    .invoke()?;
            }
            Err(_) => {
                // Add transfer delegate
                AddPluginV1CpiBuilder::new(&self.core_program.to_account_info())
                    .asset(&self.asset.to_account_info())
                    .collection(Some(&self.collection.to_account_info()))
                    .payer(&self.payer.to_account_info())
                    .authority(Some(&self.owner.to_account_info()))
                    .system_program(&self.system_program.to_account_info())
                    .plugin(Plugin::TransferDelegate( TransferDelegate { } ))
                    .init_authority(PluginAuthority::Address { address: self.asset_auction.key() })
                    .invoke()?;
            }
        };

        Ok(())
    }

}