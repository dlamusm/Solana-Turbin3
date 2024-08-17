use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, metadata::{mpl_token_metadata::instructions::{ThawDelegatedAccountCpi, ThawDelegatedAccountCpiAccounts}, MasterEditionAccount, Metadata, MetadataAccount}, token::{revoke, Mint, Revoke, Token, TokenAccount, MintTo, mint_to}};

use crate::state::{StakeAccount, StakeConfig};
use crate::errors::StakeErrors;

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    pub mint: Account<'info, Mint>,
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
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = user,
    )]
    pub mint_ata: Account<'info, TokenAccount>,
    #[account(
        seeds = [
            b"metadata",
            metadata_program.key().as_ref(),
            mint.key().as_ref()
        ],
        seeds::program = metadata_program.key(),
        bump,
    )]
    pub metadata: Account<'info, MetadataAccount>,
    #[account(
        seeds = [
            b"metadata",
            metadata_program.key().as_ref(),
            mint.key().as_ref(),
            b"edition"
        ],
        seeds::program = metadata_program.key(),
        bump,
    )]
    pub edition: Account<'info, MasterEditionAccount>,
    #[account(
        init_if_needed,
        payer = user,
        associated_token::mint = rewards_mint,
        associated_token::authority = user,
    )]
    pub rewards_ata: Account<'info, TokenAccount>,
    // programs
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub metadata_program: Program<'info, Metadata>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl<'info> Unstake<'info> {
    pub fn unstake(&mut self) -> Result<()> {

        // check that freeze period is complete
        let time_elapsed = ((Clock::get()?.unix_timestamp - self.stake_account.staked_timestamp) / 86400) as u32;
        require!(time_elapsed >= self.stake_config.freeze_period, StakeErrors::FreezePeriodNotCompleted);


        // remove freeze
        let seeds = &[
            b"stake_account",
            self.mint.to_account_info().key.as_ref(),
            self.stake_config.to_account_info().key.as_ref(),
            &[self.stake_account.bump]
        ];     
        let signer_seeds = &[&seeds[..]];

        let delegate = &self.stake_account.to_account_info();
        let token_account = &self.mint_ata.to_account_info();
        let edition = &self.edition.to_account_info();
        let mint = &self.mint.to_account_info();
        let token_program = &self.token_program.to_account_info();
        let metadata_program = &self.metadata_program.to_account_info();
        
        ThawDelegatedAccountCpi::new(
            metadata_program,
            ThawDelegatedAccountCpiAccounts {
                delegate,
                token_account,
                edition,
                mint,
                token_program,
            }
        ).invoke_signed(signer_seeds)?;

        let cpi_program = self.token_program.to_account_info();

        let cpi_accounts = Revoke {
            source: self.mint_ata.to_account_info(),
            authority: self.user.to_account_info(),
        };

        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);

        revoke(cpi_ctx)?;

        Ok(())
    }

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

        Ok(())
    }
}