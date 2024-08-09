use anchor_lang::prelude::*;

#[error_code]
pub enum EscrowErrors {
    #[msg("To do execute this instruction you must be the maker!!")]
    InvalidMaker
}
