use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token};

use crate::StakeConfig;


#[derive(Accounts)]
pub struct InitializeStake<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        init,
        payer = signer,
        seeds = [b"stake_config"],
        bump,
        space = 8 + StakeConfig::INIT_SPACE,
    )]
    pub stake_config: Account<'info, StakeConfig>,
    #[account(
        init,
        payer = signer,
        seeds = [b"stake_rewards", stake_config.key().as_ref()],
        bump,
        mint::decimals = 6,
        mint::authority = stake_config,
    )]
    pub rewards_mint: Account<'info, Mint>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}


impl<'info> InitializeStake<'info> {
    pub fn initialize_stake(
        &mut self,
        points_per_day: u8,
        max_stake_accounts: u8,
        freeze_period: u32,
        bumps: &InitializeStakeBumps
    ) -> Result<()> {
        self.stake_config.set_inner(StakeConfig{
            points_per_day,
            max_stake_accounts,
            freeze_period,
            bump: bumps.stake_config,
            rewards_mint_bump: bumps.rewards_mint,
        });
        Ok(())
    }
}