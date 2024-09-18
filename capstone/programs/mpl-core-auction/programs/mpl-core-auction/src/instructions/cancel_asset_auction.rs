use anchor_lang::prelude::*;
use mpl_core::{
    accounts::{BaseAssetV1, BaseCollectionV1}, 
    instructions::{RemovePluginV1CpiBuilder, UpdatePluginV1CpiBuilder, RevokePluginAuthorityV1CpiBuilder}, 
    types::{PluginType, UpdateAuthority, FreezeDelegate, Plugin }, ID as CORE_PROGRAM_ID
};



use crate::{CollectionAuction, AssetAuction, AuctionErrors, Config};


#[derive(Accounts)]
pub struct CancelAssetAuction<'info> {
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
        mut,
        close = payer,
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

impl<'info> CancelAssetAuction<'info> {
    pub fn cancel_asset_auction(&mut self) -> Result<()> {
        // validate auction has not started
        require!(self.asset_auction.buyer == self.asset_auction.owner, AuctionErrors::AuctionStarted);

        // set program signer seeds
        let signer_seeds: [&[&[u8]]; 1] = [&[
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
            .invoke_signed(&signer_seeds)?;
  
        // remove freeze delegate plugin
        RemovePluginV1CpiBuilder::new(&self.core_program.to_account_info())
            .asset(&self.asset.to_account_info())
            .collection(Some(&self.collection.to_account_info()))
            .payer(&self.payer.to_account_info())
            .authority(Some(&self.owner.to_account_info()))
            .system_program(&self.system_program.to_account_info())
            .plugin_type(PluginType::FreezeDelegate)
            .invoke()?;

        // revoke transfer delegate
        RevokePluginAuthorityV1CpiBuilder::new(&self.core_program.to_account_info())
            .asset(&self.asset.to_account_info())
            .collection(Some(&self.collection.to_account_info()))
            .payer(&self.payer.to_account_info())
            .authority(Some(&self.asset_auction.to_account_info()))
            .system_program(&self.system_program.to_account_info())
            .plugin_type(PluginType::TransferDelegate)
            .invoke_signed(&signer_seeds)?;
        
        // remove transfer delegate plugin
        RemovePluginV1CpiBuilder::new(&self.core_program.to_account_info())
            .asset(&self.asset.to_account_info())
            .collection(Some(&self.collection.to_account_info()))
            .payer(&self.payer.to_account_info())
            .authority(Some(&self.owner.to_account_info()))
            .system_program(&self.system_program.to_account_info())
            .plugin_type(PluginType::TransferDelegate)
            .invoke()?;

        Ok(())
    }

}