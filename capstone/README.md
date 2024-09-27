# Solana Metaverse Auction House

## Description

Welcome to the Solana Metaverse Auction House, where the most coveted and exclusive in-game assets from Solana's top-tier games are up for grabs. Here, only the finest treasures and rarest items make the cut, offering you a chance to own a piece of gaming history.

## Why building this project

- Visibility for rare collections and assets on the different games in the ecosystem. 
- Bringing the game assets to the collectors and not necessarily the collectors to the game.
- New trading experiences with interactive dynamics.
- Better pricing for low liquidity items.

## Tech stack

- Typescript
- Rust
- Anchor

## Instructions

- initialize: initialize an auction program.
- create_collection_auction: whitelist an mpl-core collection.
- create_asset_auction: create an auction for an mpl-core asset that belongs to the whitelisted mpl-core collections.
- cancel_asset_auction: cancel an asset auction before a bid is placed.
- bid_asset_auction: bid on an asset auction.
- complete_asset_auction: transfer the asset to the buyer and transfer sol to the seller, after the auction is over.

## Deployment

- Devnet: T8Bk6U2jRGNkqDqtvjGvKGqBzvurwx7gTdmag6jQupL

## Testing suite

The mpl-core-auction program instructions are fully tested. Run `anchor test` to run all tests. The test cover the following scenarios:

```
  Collection Whitelisting
    ✔ create collection auction (405ms)

  Asset auction creation
    ✔ create asset auction (834ms)
    ✔ create asset auction with existing plugins (2440ms)
    ✔ try create asset auction with invalid duration (426ms)
    ✔ try owner unfreeze asset raises (816ms)
    ✔ try create double asset auction raises (805ms)
    ✔ try create asset auction on frozen asset raises (818ms)
    ✔ try create asset auction on unfrozen asset with freeze delegate raises (1634ms)
    ✔ try create asset auction on asset with transfer delegate raises (817ms)


  Asset auction cancel
    ✔ cancel asset auction (1230ms)
    ✔ try cancel asset auction after bid raises (1644ms)


  Asset auction bidding
    ✔ bid (1637ms)
    ✔ bid raising (2454ms)
    ✔ try lower bid raises (2051ms)
    ✔ try owner bid raises (1630ms)
    ✔ try bid after auction is completed (2048ms)


  Asset auction complete
    ✔ complete auction (2058ms)
    ✔ try complete before duration expires raises (1631ms)
    ✔ try complete before starting raises (1225ms)
```