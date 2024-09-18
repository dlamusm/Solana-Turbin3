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


describe("Asset auction bidding", () => {
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
        seed: 5,
        feeBPS: 100,
        minDurationMinutes: 0,
        maxDurationMinutes: 14400,
    };

    // config account pda
    const [auctionConfigPDA, _] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("config"), new BN(initParams.seed).toArrayLike(Buffer, "le", 4)],
        program.programId,
    );

    // vault pda
    const [vaultPDA, _2] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), auctionConfigPDA.toBuffer()],
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

    // collection auction account pda
    const [auctionCollectionPDA, _3] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("collection"), auctionConfigPDA.toBuffer(), collectionPubkey.toBuffer()],
        program.programId,
    );

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

    it("bid", async () => {
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
            })
            .accounts({
                previousBuyer: payerWallet.publicKey,
                collection: collectionPubkey,
                asset: assetPubkey,
            })
            .signers([buyer])
            .rpc();

        
        // Get asset auction PDA
        const [assetAuctionPDA, _] = anchor.web3.PublicKey.findProgramAddressSync(
            [auctionCollectionPDA.toBuffer(), assetPubkey.toBuffer()],
            program.programId,
        );

        // fetch asset auction account
        const assetAuctionAccount = await program.account.assetAuction.fetch(assetAuctionPDA);

        assert(assetAuctionAccount.buyer.toBase58() === buyer.publicKey.toBase58());
        assert(assetAuctionAccount.buyerBidLamports.eq(buyerBid));
        assert(assetAuctionAccount.firstBidTimestamp.gt(new BN(0)));
    });

    it("bid raising", async () => {
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

        // fetch vault starting lamports
        let vaultAccountInfo = await program.provider.connection.getAccountInfo(vaultPDA)
        const vault_starting_lamports = vaultAccountInfo?.lamports

        // create first bid
        const buyer = await createSigner()
        const buyerBid = new BN(2 * anchor.web3.LAMPORTS_PER_SOL)
        await program.methods
            .bidAssetAuction(buyerBid)
            .accountsPartial({
                config: auctionConfigPDA,
                buyer: buyer.publicKey,
            })
            .accounts({
                previousBuyer: payerWallet.publicKey,
                collection: collectionPubkey,
                asset: assetPubkey,
            })
            .signers([buyer])
            .rpc();

        // fetch first buyer lamports after bid
        let buyerAccountInfo = await program.provider.connection.getAccountInfo(buyer.publicKey)
        assert(buyerAccountInfo?.lamports == anchor.web3.LAMPORTS_PER_SOL * 8)

        // fetch vault lamports after first bid
        vaultAccountInfo = await program.provider.connection.getAccountInfo(vaultPDA)
        assert(vaultAccountInfo?.lamports == vault_starting_lamports + buyerBid.toNumber())

        // create second bid
        const buyer2 = await createSigner()
        const buyerBid2 = new BN(3 * anchor.web3.LAMPORTS_PER_SOL)
        await program.methods
            .bidAssetAuction(buyerBid2)
            .accountsPartial({
                config: auctionConfigPDA,
                buyer: buyer2.publicKey,
            })
            .accounts({
                previousBuyer: buyer.publicKey,
                collection: collectionPubkey,
                asset: assetPubkey,
            })
            .signers([buyer2])
            .rpc();

        // fetch first buyer lamports after second bid
        buyerAccountInfo = await program.provider.connection.getAccountInfo(buyer.publicKey)
        assert(buyerAccountInfo?.lamports == anchor.web3.LAMPORTS_PER_SOL * 10)

        // fetch second buyer lamports after second bid
        let buyer2AccountInfo = await program.provider.connection.getAccountInfo(buyer2.publicKey)
        assert(buyer2AccountInfo?.lamports == anchor.web3.LAMPORTS_PER_SOL * 7)

        // fetch vault lamports after second bid
        vaultAccountInfo = await program.provider.connection.getAccountInfo(vaultPDA)
        assert(vaultAccountInfo?.lamports == vault_starting_lamports + buyerBid2.toNumber())
        
        // Get asset auction PDA
        const [assetAuctionPDA, _] = anchor.web3.PublicKey.findProgramAddressSync(
            [auctionCollectionPDA.toBuffer(), assetPubkey.toBuffer()],
            program.programId,
        );

        // fetch asset auction account
        const assetAuctionAccount = await program.account.assetAuction.fetch(assetAuctionPDA);
        assert(assetAuctionAccount.buyer.toBase58() === buyer2.publicKey.toBase58());
        assert(assetAuctionAccount.buyerBidLamports.eq(buyerBid2));
        assert(assetAuctionAccount.firstBidTimestamp.gt(new BN(0)));
        console.log(assetAuctionAccount.firstBidTimestamp.toNumber())
    });

    it("try lower bid raises", async () => {
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
            })
            .accounts({
                previousBuyer: payerWallet.publicKey,
                collection: collectionPubkey,
                asset: assetPubkey,
            })
            .signers([buyer])
            .rpc();


        // should fail because of lower bid
        const buyer2 = await createSigner()
        const buyerBid2 = new BN(1 * anchor.web3.LAMPORTS_PER_SOL)
        let failed = false;
        try {
            await program.methods
                .bidAssetAuction(buyerBid2)
                .accountsPartial({
                    config: auctionConfigPDA,
                    buyer: buyer2.publicKey,
                })
                .accounts({
                    previousBuyer: buyer.publicKey,
                    collection: collectionPubkey,
                    asset: assetPubkey,
                })
                .signers([buyer2])
                .rpc();
        } catch (error) {
            if (error instanceof AnchorError) {
                assert(error.error.errorCode.code === "InvalidBid")
                failed = true
            }
        } finally {
            assert(failed)
        }
    });

    it("try owner bid raises", async () => {
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
            })
            .accounts({
                previousBuyer: payerWallet.publicKey,
                collection: collectionPubkey,
                asset: assetPubkey,
            })
            .signers([buyer])
            .rpc();


        // should fail because of owner bid
        const ownerBid = new BN(5 * anchor.web3.LAMPORTS_PER_SOL)
        let failed = false;
        try {
            await program.methods
                .bidAssetAuction(ownerBid)
                .accountsPartial({
                    config: auctionConfigPDA,
                    buyer: signer.publicKey,
                })
                .accounts({
                    previousBuyer: buyer.publicKey,
                    collection: collectionPubkey,
                    asset: assetPubkey,
                })
                .rpc();
        } catch (error) {
            if (error instanceof AnchorError) {
                assert(error.error.errorCode.code === "OwnerBid")
                failed = true
            }
        } finally {
            assert(failed)
        }
    });

    it("try bid after auction is completed", async () => {
        // create asset 
        let asset = await createAsset()
        const assetPubkey = new anchor.web3.PublicKey(asset.publicKey.toString());

        // create asset auction args
        const createAssetAuctionArgs = {
            durationMinutes: 0,
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
            })
            .accounts({
                previousBuyer: payerWallet.publicKey,
                collection: collectionPubkey,
                asset: assetPubkey,
            })
            .signers([buyer])
            .rpc();

        // should fail because of auction complete
        const buyer2 = await createSigner()
        const buyerBid2 = new BN(3 * anchor.web3.LAMPORTS_PER_SOL)
        let failed = false;
        try {
            await program.methods
                .bidAssetAuction(buyerBid2)
                .accountsPartial({
                    config: auctionConfigPDA,
                    buyer: buyer2.publicKey,
                })
                .accounts({
                    previousBuyer: buyer.publicKey,
                    collection: collectionPubkey,
                    asset: assetPubkey,
                })
                .signers([buyer2])
                .rpc();
        } catch (error) {
            if (error instanceof AnchorError) {
                assert(error.error.errorCode.code === "AuctionEnded")
                failed = true
            }
        } finally {
            assert(failed)
        }
    });
});
