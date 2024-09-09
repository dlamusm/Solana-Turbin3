use anchor_lang::prelude::*;


#[account]
#[derive(InitSpace)]
pub struct Config {
    pub seed: u32,
    pub admin: Pubkey,
    pub fee_bps: u8,
    pub min_duration_minutes: u32,
    pub max_duration_minutes: u32,
    pub vault_bump: u8,
    pub tresuary_bump: u8,
    pub bump: u8,
}