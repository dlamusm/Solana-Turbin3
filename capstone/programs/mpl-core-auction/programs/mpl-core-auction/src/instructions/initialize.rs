use anchor_lang::prelude::*;

use crate::AuctionConfig;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        seeds = [b"auction_config"],
        bump,
        space = AuctionConfig::INIT_SPACE
    )]
    pub auction_config: Account<'info, AuctionConfig>,
    pub system_program: Program<'info, System>,
}


impl<'info> Initialize<'info> {
    pub fn initialize(&mut self, fee_bps: u8, min_duration_min: u32, max_duration_min: u32, bumps: &InitializeBumps) -> Result<()> {
        self.auction_config.set_inner(AuctionConfig{
            admin: self.admin.key(),
            fee_bps,
            min_duration_min,
            max_duration_min,
            bump: bumps.auction_config,
        });
        Ok(())
    }
}