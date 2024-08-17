use anchor_lang::prelude::*;


#[account]
#[derive(InitSpace)]
pub struct StakeConfig {
    pub points_per_day: u8,
    pub max_stake_accounts: u8,
    pub freeze_period: u32,
    pub rewards_mint_bump: u8,
    pub bump: u8,
}