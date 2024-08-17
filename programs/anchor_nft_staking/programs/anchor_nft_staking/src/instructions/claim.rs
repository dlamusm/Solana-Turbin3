use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{mint_to, Mint, MintTo, Token, TokenAccount}};

use crate::state::{StakeConfig, StakeAccount};

#[derive(Accounts)]
pub struct Claim<'info> {
    // user accounts
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = rewards_mint,
        associated_token::authority = user,
    )]
    pub rewards_ata: Account<'info, TokenAccount>,
    // stake  accounts
    #[account(
        seeds = [b"stake_config".as_ref()],
        bump = stake_config.bump
    )]
    pub stake_config: Account<'info, StakeConfig>,
    #[account(
        mut,
        close = user,
        seeds = [b"stake_account".as_ref(), mint.key().as_ref(), stake_config.key().as_ref()],
        bump = stake_account.bump,
    )]
    pub stake_account: Account<'info, StakeAccount>,
    #[account(
        mut,
        seeds = [b"stake_rewards".as_ref(), stake_config.key().as_ref()],
        bump = stake_config.rewards_mint_bump
    )]
    pub rewards_mint: Account<'info, Mint>,
    // nft mint
    pub mint: Account<'info, Mint>,
    // programs
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> Claim<'info> {
    pub fn claim(&mut self) -> Result<()> {

        // get time since last claim
        let rewards_time_elapsed = ((Clock::get()?.unix_timestamp - self.stake_account.rewards_timestamp) / 86400) as u32;
        let points = rewards_time_elapsed as u32 * self.stake_config.points_per_day as u32;

        // mint to users ata
        let cpi_program = self.token_program.to_account_info();

        let seeds = &[
            b"stake_config".as_ref(),
            &[self.stake_config.bump]
        ];
        let signer_seeds = &[&seeds[..]];

        let cpi_accounts = MintTo {
            mint: self.rewards_mint.to_account_info(),
            to: self.rewards_ata.to_account_info(),
            authority: self.stake_config.to_account_info(),
        };

        let cpi_context = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);

        mint_to(cpi_context, points as u64 * 10_u64.pow(self.rewards_mint.decimals as u32))?;

        //update stake account rewards timestamp
        self.stake_account.rewards_timestamp = Clock::get()?.unix_timestamp;
        
        Ok(())
    }
}