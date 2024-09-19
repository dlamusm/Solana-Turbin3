import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorError } from "@coral-xyz/anchor";
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { 
    mplCore,
    createCollection,
    fetchCollection,
    create,
    fetchAsset,
    AssetV1,
} from '@metaplex-foundation/mpl-core'
import { 
    createSignerFromKeypair,
    signerIdentity,
    generateSigner,
} from '@metaplex-foundation/umi'
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import assert from "assert";

import { MplCoreAuction } from "../target/types/mpl_core_auction";


describe("Asset auction cancel", () => {
    // configure provider
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);    

    // configure program
    const program = anchor.workspace.MplCoreAuction as Program<MplCoreAuction>;

    // create a UMI connection to run mpl core commands
    const umi = createUmi(provider.connection);
    const payerWallet = provider.wallet as NodeWallet;
    const keypair = umi.eddsa.createKeypairFromSecretKey(payerWallet.payer.secretKey);
    const signer = createSignerFromKeypair(umi, keypair);
    umi.use(signerIdentity(signer));
    umi.use(mplCore())

    // config params
    const initParams = {
        seed: 4,
        feeBPS: 100,
        minDurationMinutes: 0,
        maxDurationMinutes: 14400,
    };

    // config account pda
    const [auctionConfigPDA, _] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("config"), new BN(initParams.seed).toArrayLike(Buffer, "le", 4)],
        program.programId,
    );

    // collection params
    const collectionSigner = generateSigner(umi)
    const collectionPubkey = new anchor.web3.PublicKey(collectionSigner.publicKey.toString());
    const collectionArgs = {
        collection: collectionSigner,
        name: 'My Collection',
        uri: "",
    };

    // helper function to create asset
    async function createAsset(): Promise<AssetV1> {
        // Create asset args
        const assetSigner = generateSigner(umi)
        const collection = await fetchCollection(umi, collectionSigner.publicKey);
        const assetArgs = {
            collection: collection,
            asset: assetSigner,
            name: 'My asset',
            uri: "",
        };

        // Create asset
        await create(umi, assetArgs).sendAndConfirm(umi);
        return fetchAsset(umi, assetSigner.publicKey)
    }

    // helper function to create keypair with funds
    async function createSigner(): Promise<anchor.web3.Keypair> {
        const signer = anchor.web3.Keypair.generate()

        // airdrop
        const airdropSignature = await provider.connection.requestAirdrop(
            signer.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL,
        )
        const latestBlockHash = await provider.connection.getLatestBlockhash();
        await provider.connection.confirmTransaction({
            blockhash: latestBlockHash.blockhash,
            lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
            signature: airdropSignature,
        });

        return signer

    }       

    before("intialize auction", async () => {
        await program.methods
            .initialize(
                initParams.seed,
                initParams.feeBPS,
                initParams.minDurationMinutes,
                initParams.maxDurationMinutes
            )
            .rpc(); 
    });

    before("create collection", async () => {
        await createCollection(umi, collectionArgs).sendAndConfirm(umi);

        // verify collection exists
        const collection = await fetchCollection(umi, collectionSigner.publicKey);
        assert(collection.publicKey == collectionSigner.publicKey);
    });

    before("create collection auction", async () => {
        // whitelist collection
        await program.methods
            .createCollectionAuction()
            .accountsPartial({config: auctionConfigPDA})
            .accounts({collection: collectionPubkey})
            .rpc();
    });

    it("cancel asset auction", async () => {
        // create asset 
        let asset = await createAsset()
        const assetPubkey = new anchor.web3.PublicKey(asset.publicKey.toString());

        // create asset auction args
        const createAssetAuctionArgs = {
            durationMinutes: 1,
            minBid: new BN(100),
        }
        
        // create asset auction
        await program.methods
            .createAssetAuction(createAssetAuctionArgs.durationMinutes, createAssetAuctionArgs.minBid)
            .accountsPartial({config: auctionConfigPDA})
            .accounts({
                collection: collectionPubkey,
                asset: assetPubkey,
            })
            .rpc();

        // check freeze and transfer delegate exists
        asset = await fetchAsset(umi, asset.publicKey)
        assert(asset.transferDelegate != undefined, "Transfer delegate not set")
        assert(asset.freezeDelegate != undefined, "Freeze delegate not set")

        // Cancel asset auction
        await program.methods
            .cancelAssetAuction()
            .accountsPartial({config: auctionConfigPDA})
            .accounts({
                collection: collectionPubkey,
                asset: assetPubkey,
            })
            .rpc();

        // check freeze and transfer delegate exists
        asset = await fetchAsset(umi, asset.publicKey)
        assert(asset.transferDelegate == undefined, "Transfer delegate exists after auction cancel")
        assert(asset.freezeDelegate == undefined, "Freeze delegate exists after auction cancel")
    });

    it("try cancel asset auction after bid raises", async () => {
        // create asset 
        let asset = await createAsset()
        const assetPubkey = new anchor.web3.PublicKey(asset.publicKey.toString());

        // create asset auction args
        const createAssetAuctionArgs = {
            durationMinutes: 1,
            minBid: new BN(100),
        }
        
        // create asset auction
        await program.methods
            .createAssetAuction(createAssetAuctionArgs.durationMinutes, createAssetAuctionArgs.minBid)
            .accountsPartial({config: auctionConfigPDA})
            .accounts({
                collection: collectionPubkey,
                asset: assetPubkey,
            })
            .rpc();

        // create first bid
        const buyer = await createSigner()
        const buyerBid = new BN(2 * anchor.web3.LAMPORTS_PER_SOL)
        await program.methods
            .bidAssetAuction(buyerBid)
            .accountsPartial({
                config: auctionConfigPDA,
                buyer: buyer.publicKey,
                payer: buyer.publicKey,
            })
            .accounts({
                previousBuyer: payerWallet.publicKey,
                collection: collectionPubkey,
                asset: assetPubkey,
            })
            .signers([buyer])
            .rpc();

        // Try to cancel
        let cancel_failed = false;
        try {
            await program.methods
                .cancelAssetAuction()
                .accountsPartial({config: auctionConfigPDA})
                .accounts({
                    collection: collectionPubkey,
                    asset: assetPubkey,
                })
                .rpc();
        } catch (error) {
            if (error instanceof AnchorError) {
                assert(error.error.errorCode.code === "AuctionStarted")
                cancel_failed = true
            }
        } finally {
           assert(cancel_failed, "Auction was cancelled after first bid.")
        }

    });
});

