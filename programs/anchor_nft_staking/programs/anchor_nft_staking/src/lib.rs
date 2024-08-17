use anchor_lang::prelude::*;

mod state;
mod instructions;
mod errors;

pub use state::*;
pub use instructions::*;
pub use errors::*;


declare_id!("E7WyCP2yiekqyitQ6dFLyCb5X3GthP4W54QWejM1voc");


#[program]
pub mod anchor_nft_staking {
    use super::*;

    pub fn initialize_stake(
        ctx: Context<InitializeStake>,
        points_per_stake_account: u8,
        max_stake_accounts: u8,
        freeze_period: u32,
    ) -> Result<()> {
        ctx.accounts.initialize_stake(
            points_per_stake_account,
            max_stake_accounts,
            freeze_period,
            &ctx.bumps,
        )?;
        Ok(())
    }

    pub fn stake(ctx: Context<Stake>) -> Result<()> {
        ctx.accounts.stake(&ctx.bumps)?;
        Ok(())
    }

    pub fn unstake(ctx: Context<Unstake>) -> Result<()> {
        ctx.accounts.unstake()?;
        ctx.accounts.claim()?;
        Ok(())
    }

    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        ctx.accounts.claim()?;
        Ok(())
    }

}
