use anchor_lang::prelude::*;

#[error_code]
pub enum StakeErrors {
    #[msg("Freeze period not completed.")]
    FreezePeriodNotCompleted
}