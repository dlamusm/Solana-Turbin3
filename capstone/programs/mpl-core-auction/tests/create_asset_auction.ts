import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { createCollection, fetchCollection, mplCore, create, fetchAsset } from '@metaplex-foundation/mpl-core'
import { createSignerFromKeypair, signerIdentity, generateSigner} from '@metaplex-foundation/umi'
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import assert from "assert";

import { MplCoreAuction } from "../target/types/mpl_core_auction";


describe("Asset auction creation", () => {
    // Configure provider
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);    

    // configure program
    const program = anchor.workspace.MplCoreAuction as Program<MplCoreAuction>;

    // Initialization params
    const initParams = {
        seed: 3,
        feeBPS: 100,
        minDurationMinutes: 0,
        maxDurationMinutes: 2,
    };

    // Get auction config pda
    const [auctionConfigPDA, _] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("config"), new BN(initParams.seed).toBuffer("le", 4)],
        program.programId,
    );

    // Create a UMI connection to create collection
    const umi = createUmi(provider.connection);
    const payerWallet = provider.wallet as NodeWallet;
    const keypair = umi.eddsa.createKeypairFromSecretKey(payerWallet.payer.secretKey);
    const signer = createSignerFromKeypair(umi, keypair);
    umi.use(signerIdentity(signer));
    umi.use(mplCore())

    // Create collection args
    const collectionSigner = generateSigner(umi)
    const collectionPubkey = new anchor.web3.PublicKey(collectionSigner.publicKey.toString());
    const collectionArgs = {
        collection: collectionSigner,
        name: 'My Collection',
        uri: "",
    };

    // Create asset args
    const assetSigner = generateSigner(umi)
    const assetPubkey = new anchor.web3.PublicKey(assetSigner.publicKey.toString());
    const assetArgs = {
        asset: assetSigner,
        name: 'My asset',
        uri: "",
    };

    // create asset auction args
    const createAssetAuctionArgs = {
        durationMinutes: 1,
        minBid: 100,
    }

    it("Create collection", async () => {
        // Create collection
        await createCollection(umi, collectionArgs).sendAndConfirm(umi);

        // verify collection exists
        const collection = await fetchCollection(umi, collectionSigner.publicKey);
        assert(collection.publicKey == collectionSigner.publicKey);
    });

    it("Create asset", async () => {
        // add collection to asset
        const collection = await fetchCollection(umi, collectionSigner.publicKey);
        const assetArgsWithCollection = {
            ...assetArgs,
            collection: collection
        }

        // Create collection
        await create(umi, assetArgsWithCollection).sendAndConfirm(umi);

        // verify asset exists
        const asset = await fetchAsset(umi, assetSigner.publicKey);
        assert(asset.publicKey == assetSigner.publicKey);
        assert(asset.updateAuthority.address == collectionSigner.publicKey)
    });

    it("Initialize Auction", async () => {
        // initialize
        const tx = await program.methods
            .initialize(
                initParams.seed,
                initParams.feeBPS,
                initParams.minDurationMinutes,
                initParams.maxDurationMinutes
            )
            .rpc(); 
    });

    it("whitelist collection", async () => {
        // add collection
        await program.methods
            .whitelistCollection()
            .accountsPartial({config: auctionConfigPDA})
            .accounts({coreCollection: collectionPubkey})
            .rpc();
    });

    it("Create asset auction", async () => {
        // add collection
        await program.methods
            .createAssetAuction(createAssetAuctionArgs.durationMinutes, createAssetAuctionArgs.minBid)
            .accountsPartial({config: auctionConfigPDA})
            .accounts({
                coreCollection: collectionPubkey,
                coreAsset: assetPubkey,
            })
            .rpc();

        // get asset auction pda
        const [assetAuctionPDA, bump] = anchor.web3.PublicKey.findProgramAddressSync(
            [collectionPubkey.toBuffer(), assetPubkey.toBuffer()],
            program.programId,
        );

        // fetch auction asset pda
        const asset_auction = await program.account.assetAuction.fetch(assetAuctionPDA);

        // verify values
        assert(asset_auction.coreAsset = assetPubkey);
        assert(asset_auction.seller === payerWallet.payer.publicKey);
        assert(asset_auction.durationMinutes === createAssetAuctionArgs.durationMinutes);
        assert(asset_auction.minBid === createAssetAuctionArgs.minBid);
        assert(asset_auction.buyer === null);
        assert(asset_auction.buyerBid === 0);
        assert(asset_auction.firstBidTimestamp === 0);
        assert(asset_auction.bump === bump);
        
        // verify freeze plugin
        
        
    });

});

