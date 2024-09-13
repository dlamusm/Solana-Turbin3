use anchor_lang::prelude::*;
use mpl_core::{
    accounts::{BaseAssetV1, BaseCollectionV1}, 
    instructions::RemovePluginV1CpiBuilder, 
    types::{PluginType, UpdateAuthority}, ID as CORE_PROGRAM_ID
};



use crate::{Collection, AssetAuction};


#[derive(Accounts)]
pub struct CancelAssetAuction<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
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

impl<'info> CancelAssetAuction<'info> {
    pub fn cancel_asset_auction(&mut self) -> Result<()> {
        // set program signer seeds
        let signer_seeds: [&[&[u8]]; 1] = [&[
            self.collection.to_account_info().key.as_ref(),
            self.core_asset.to_account_info().key.as_ref(),
            &[self.asset_auction.bump],
        ]];

        // remove freeze delegate plugin
        RemovePluginV1CpiBuilder::new(&self.core_program.to_account_info())
            .asset(&self.core_asset.to_account_info())
            .collection(Some(&self.core_collection.to_account_info()))
            .payer(&self.seller.to_account_info())
            .authority(Some(&self.asset_auction.to_account_info()))
            .system_program(&self.system_program.to_account_info())
            .plugin_type(PluginType::FreezeDelegate)
            .invoke_signed(&signer_seeds)?;
    
        // remove transfer delegate plugin
        RemovePluginV1CpiBuilder::new(&self.core_program.to_account_info())
            .asset(&self.core_asset.to_account_info())
            .collection(Some(&self.core_collection.to_account_info()))
            .payer(&self.seller.to_account_info())
            .authority(Some(&self.asset_auction.to_account_info()))
            .system_program(&self.system_program.to_account_info())
            .plugin_type(PluginType::TransferDelegate)
            .invoke_signed(&signer_seeds)?;

        Ok(())
    }

}