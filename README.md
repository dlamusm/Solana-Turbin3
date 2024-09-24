# Solana Turbin3 work

Work done as part of the Turbin3-WBA program.

## Capstone project

Solana Metaverse Auction House

### Description

Welcome to the Solana Metaverse Auction House, where the most coveted and exclusive in-game assets from Solana's top-tier games are up for grabs. Here, only the finest treasures and rarest items make the cut, offering you a chance to own a piece of gaming history.

### Technical description

Anchor program to do auctions with mpl-core NFTs. The admin can initialize the auction program with specific parameters and whitelist selected collections. Users can list NFTs from whitelisted collections and bid on existing listings.

Implementation can be found under the `capstone` folder.

### Instructions

- initialize: initialize an auction program.
- create_collection_auction: whitelist an mpl-core collection.
- create_asset_auction: create an auction for an mpl-core asset that belongs to the whitelisted mpl-core collections.
- cancel_asset_auction: cancel an asset auction before a bid is placed.
- bid_asset_auction: bid on an asset auction.
- complete_asset_auction: transfer the asset to the buyer and transfer sol to the seller, after the auction is over.

### Deployment

- Devnet: T8Bk6U2jRGNkqDqtvjGvKGqBzvurwx7gTdmag6jQupL

## Scripts

### Available scripts

- generate_keypair: generate a keypair.
- airdrop_to_wallet: airdrop some devnet sol to a keypair.
- base58_to_wallet: convert base58 to byte array.
- wallet_to_base58: convert byte array to base58.
- mpl_core_create_collection: create a collection using mpl-core.
- mpl_core_create_asset: create an asset using mpl-core.

### Usage

1. Add a wallet to run the scripts: `scripts/wallet.json`.
2. Run `npm run <script_name>`.

## Programs

Some example programs done during the course.

- anchor_escrow: escrow program to trade mpl-token and token-2022 tokens.
- anchor_nft_staking: code to stake mpl-token NFTs and yield some rewards. 

## Development environment

### Start a docker shell with all dependencies installed

Run `./bash/docker_shell`.
