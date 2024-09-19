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
import { LAMPORTS_PER_SOL } from "@solana/web3.js";


describe("Asset auction complete", () => {
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
        seed: 6,
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

    // tresuary pda
    const [tresuaryPDA, _3] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("tresuary"), auctionConfigPDA.toBuffer()],
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
    const [auctionCollectionPDA, _4] = anchor.web3.PublicKey.findProgramAddressSync(
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

    it("complete auction", async () => {
        // create asset 
        let asset = await createAsset();
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

        // fetch owner account before complete
        const ownerPubkey = new anchor.web3.PublicKey(signer.publicKey.toString());
        const ownerInitialAccountInfo = await program.provider.connection.getAccountInfo(ownerPubkey);

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

        
        // complete auction
        await program.methods
            .completeAssetAuction()
            .accountsPartial({
                config: auctionConfigPDA,
                owner: signer.publicKey,
            })
            .accounts({
                buyer: buyer.publicKey,
                collection: collectionPubkey,
                asset: assetPubkey,
            })
            .rpc();

        // check asset
        asset = await fetchAsset(umi, asset.publicKey);
        assert(asset.owner.toString() == buyer.publicKey.toBase58());
        assert(asset.transferDelegate?.authority.type == "Owner", "Transfer delegate exists after auction cancel");
        assert(asset.freezeDelegate?.authority.type == "Owner", "Freeze delegate exists after auction cancel");

        
        // check vault and tresuary balances
        const tresuaryExpecteBalance = Math.ceil(buyerBid.toNumber() * 0.01);
        const vaultAccountInfo = await program.provider.connection.getAccountInfo(vaultPDA);
        const tresuaryAccountInfo = await program.provider.connection.getAccountInfo(tresuaryPDA);
        assert(vaultAccountInfo == null) // account is erased because of empty balance
        assert(tresuaryAccountInfo?.lamports == tresuaryExpecteBalance)

        // check owner balance after complete
        const onwerInitialLamports = ownerInitialAccountInfo?.lamports;
        const ownerExpectedBalanceExtra = Math.floor(buyerBid.toNumber() * 0.99);
        const ownerAccountInfo = await program.provider.connection.getAccountInfo(ownerPubkey);
        //assert(onwerInitialLamports != undefined)
        //assert(onwerInitialLamports + ownerExpectedBalanceExtra == ownerAccountInfo?.lamports)

        // check buyer balance after complete
        const buyerAccountInfo = await program.provider.connection.getAccountInfo(buyer.publicKey)
        assert(buyerAccountInfo?.lamports == anchor.web3.LAMPORTS_PER_SOL * 8)
    });

    it("try complete before duration expires raises", async () => {
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

        // should fail because auction has not ended
        let complete_failed = false;
        try {
            await program.methods
                .completeAssetAuction()
                .accountsPartial({
                    config: auctionConfigPDA,
                    owner: signer.publicKey,
                })
                .accounts({
                    buyer: buyer.publicKey,
                    collection: collectionPubkey,
                    asset: assetPubkey,
                })
                .rpc();
        } catch (error) {
            if (error instanceof AnchorError) {
                assert(error.error.errorCode.code === "AuctionRunning")
                complete_failed = true
            }
        } finally {
            assert(complete_failed, "Auction was completed before time.")
        }
    });

    it("try complete before starting raises", async () => {
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


        // should fail because auction has not started
        let complete_failed = false;
        const buyer = await createSigner()
        try {
            await program.methods
                .completeAssetAuction()
                .accountsPartial({
                    config: auctionConfigPDA,
                    owner: signer.publicKey,
                })
                .accounts({
                    buyer: buyer.publicKey,
                    collection: collectionPubkey,
                    asset: assetPubkey,
                })
                .rpc();
        } catch (error) {
            if (error instanceof AnchorError) {
                assert(error.error.errorCode.code === "AuctionNotStarted")
                complete_failed = true
            }
        } finally {
            assert(complete_failed, "Auction was completed before starting.")
        }
    });

});
