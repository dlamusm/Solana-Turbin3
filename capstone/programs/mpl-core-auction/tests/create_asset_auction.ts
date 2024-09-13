import * as anchor from "@coral-xyz/anchor";
import { Program, BN, AnchorError } from "@coral-xyz/anchor";
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { 
    mplCore,
    createCollection,
    fetchCollection,
    create,
    fetchAsset,
    freezeAsset,
    isFrozen,
    thawAsset, 
    addPlugin,
    AddPluginArgs,
    revokePluginAuthority,
    RevokePluginAuthorityArgs,
    NoApprovalsError,
    InvalidAuthorityError,
    approvePluginAuthority,
    ApprovePluginAuthorityArgs,
    removePlugin,
    RemovePluginArgs,
    AssetV1,
    ThawAssetArgs,
    FreezeAssetArgs,
} from '@metaplex-foundation/mpl-core'
import { 
    createSignerFromKeypair,
    signerIdentity,
    generateSigner,
    publicKey
} from '@metaplex-foundation/umi'
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import assert from "assert";
import SendTransactionError from "@solana/web3.js";

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

    // Auction collection pda
    const [auctionCollectionPDA, _2] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("collection"), collectionPubkey.toBuffer()],
        program.programId,
    );

    // create asset auction args
    const createAssetAuctionArgs = {
        durationMinutes: 1,
        minBid: 100,
    }

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

    it("Create and whitelist collection", async () => {
        // Create collection
        await createCollection(umi, collectionArgs).sendAndConfirm(umi);

        // verify collection exists
        const collection = await fetchCollection(umi, collectionSigner.publicKey);
        assert(collection.publicKey == collectionSigner.publicKey);

        // whitelist collection
        await program.methods
            .whitelistCollection()
            .accountsPartial({config: auctionConfigPDA})
            .accounts({coreCollection: collectionPubkey})
            .rpc();
    });

    it("Create asset auction", async () => {
        // Create asset 
        let asset = await createAsset()
        const assetPubkey = new anchor.web3.PublicKey(asset.publicKey.toString());
        
        // Create asset auction
        await program.methods
            .createAssetAuction(createAssetAuctionArgs.durationMinutes, createAssetAuctionArgs.minBid)
            .accountsPartial({config: auctionConfigPDA})
            .accounts({
                coreCollection: collectionPubkey,
                coreAsset: assetPubkey,
            })
            .rpc();

        // Get asset auction PDA
        const [assetAuctionPDA, bump] = anchor.web3.PublicKey.findProgramAddressSync(
            [auctionCollectionPDA.toBuffer(), assetPubkey.toBuffer()],
            program.programId,
        );

        const assetAuctionPDAUmiPubkey = publicKey(assetAuctionPDA.toString())

        // fetch asset auction account
        const assetAuctionAccount = await program.account.assetAuction.fetch(assetAuctionPDA);

        // verify values
        assert(assetAuctionAccount.coreAsset.toBase58() === assetPubkey.toBase58());
        assert(assetAuctionAccount.seller.toBase58() === payerWallet.payer.publicKey.toBase58());
        assert(assetAuctionAccount.durationMinutes === createAssetAuctionArgs.durationMinutes);
        assert(assetAuctionAccount.minBid === createAssetAuctionArgs.minBid);
        assert(assetAuctionAccount.buyer === null);
        assert(assetAuctionAccount.buyerBid === 0);
        assert(assetAuctionAccount.firstBidTimestamp.eq(new BN(0)));
        assert(assetAuctionAccount.bump === bump);

        // verify freeze plugin and asset state
        asset = await fetchAsset(umi, asset.publicKey);
        const freezeDelegateAddress = asset.freezeDelegate?.authority.address
        assert(asset.publicKey == asset.publicKey);
        assert(asset.updateAuthority.address == collectionSigner.publicKey)
        assert(freezeDelegateAddress != undefined && freezeDelegateAddress === assetAuctionPDAUmiPubkey);
        assert(isFrozen(asset));

        // verify transfer delegate
        const transferDelegateAddress = asset.transferDelegate?.authority.address
        assert(transferDelegateAddress != undefined && transferDelegateAddress === assetAuctionPDAUmiPubkey); 
    });

    it("Create asset auction with existing plugins", async () => {
        // get asset and collection
        let asset = await createAsset()
        const assetPubkey = new anchor.web3.PublicKey(asset.publicKey.toString());
        const collection = await fetchCollection(umi, collectionSigner.publicKey);
        
        // freeze asset
        const freezeAssetArgs = {
            asset: asset,
            collection: collection,
            delegate: signer
        };
        await freezeAsset(umi, freezeAssetArgs).sendAndConfirm(umi);

        // thaw asset
        asset = await fetchAsset(umi, asset.publicKey)
        const thawAssetArgs = {
            asset: asset,
            collection: collection,
            delegate: signer
        };
        await thawAsset(umi, thawAssetArgs).sendAndConfirm(umi);

        // add transfer delegate
        const transferDelegate = generateSigner(umi)
        const addTransferDelegateArgs: AddPluginArgs =  {
            asset: asset.publicKey,
            collection: collection.publicKey,
            plugin: {
                type: "TransferDelegate",
                authority: { 
                    type: 'Address', 
                    address: transferDelegate.publicKey
                },
            },
        };
        await addPlugin(umi, addTransferDelegateArgs).sendAndConfirm(umi)

        // remove transfer delegate
        const revokeTransferDelegateArgs: RevokePluginAuthorityArgs = {
            asset: asset.publicKey,
            collection: collection.publicKey,
            authority: transferDelegate,
            plugin: { type: "TransferDelegate" },
            
        }
        await revokePluginAuthority(umi, revokeTransferDelegateArgs).sendAndConfirm(umi)

        // Create asset auction
        await program.methods
            .createAssetAuction(createAssetAuctionArgs.durationMinutes, createAssetAuctionArgs.minBid)
            .accountsPartial({config: auctionConfigPDA})
            .accounts({
                coreCollection: collectionPubkey,
                coreAsset: assetPubkey,
            })
            .rpc();

        // Get asset auction PDA
        const [assetAuctionPDA, _] = anchor.web3.PublicKey.findProgramAddressSync(
            [auctionCollectionPDA.toBuffer(), assetPubkey.toBuffer()],
            program.programId,
        );

        const assetAuctionPDAUmiPubkey = publicKey(assetAuctionPDA.toString())

        // verify freeze plugin
        asset = await fetchAsset(umi, asset.publicKey);
        const freezeDelegateAddress = asset.freezeDelegate?.authority.address
        assert(freezeDelegateAddress != undefined && freezeDelegateAddress === assetAuctionPDAUmiPubkey);
        assert(isFrozen(asset));

        // verify transfer delegate
        const transferDelegateAddress = asset.transferDelegate?.authority.address
        assert(transferDelegateAddress != undefined && transferDelegateAddress === assetAuctionPDAUmiPubkey); 
    });

    it("Try owner unfreeze asset raises", async () => {
        // Create asset 
        let asset = await createAsset()
        const assetPubkey = new anchor.web3.PublicKey(asset.publicKey.toString());
        const collection = await fetchCollection(umi, collectionSigner.publicKey);

        // Create asset auction
        await program.methods
            .createAssetAuction(createAssetAuctionArgs.durationMinutes, createAssetAuctionArgs.minBid)
            .accountsPartial({config: auctionConfigPDA})
            .accounts({
                coreCollection: collectionPubkey,
                coreAsset: assetPubkey,
            })
            .rpc();

        // fetch asset
        asset = await fetchAsset(umi, asset.publicKey);

        // try revoke freeze authority
        const revokeFreezeAuthorityArgs: RevokePluginAuthorityArgs = {
            asset: asset.publicKey,
            collection: collection.publicKey,
            authority: signer, // owner
            plugin: { type: "FreezeDelegate" },
        };
        
        let revoke_failed = false;
        try {
            await revokePluginAuthority(umi, revokeFreezeAuthorityArgs).sendAndConfirm(umi)
        } catch (error) {
            if (error instanceof InvalidAuthorityError) {
                revoke_failed = true
            }
        } finally {
            assert(revoke_failed)
        }

        // Try to thaw asset
        const thawAssetArgs = {
            asset: asset,
            collection: collection,
            delegate: signer // owner
        };
        
        let failed = false;
        try {
            await thawAsset(umi, thawAssetArgs).sendAndConfirm(umi);
        } catch (error) {
            if (error instanceof NoApprovalsError) {
                failed = true
            }
        } finally {
            assert(failed)
        }

        // try to remove freeze felegate plugin
        const removePluginArgs: RemovePluginArgs = {
            asset: asset.publicKey,
            collection: collection.publicKey,
            authority: signer,  // owner
            plugin: { type: 'FreezeDelegate' },
        }
        let remove_failed = false;
        try {
            await removePlugin(umi, removePluginArgs).sendAndConfirm(umi)
        } catch (error) {
            if (error instanceof InvalidAuthorityError) {
                remove_failed = true
            }
        } finally {
            assert(remove_failed)
        }
    });

    /*
    it("Updateding transfer delegate bug replication", async () => {
        // Create asset 
        let asset = await createAsset()
        const assetPubkey = new anchor.web3.PublicKey(asset.publicKey.toString());
        const collection = await fetchCollection(umi, collectionSigner.publicKey);
        console.log("--- 0. Asset created ---")
        console.log(asset)

        // add transfer delegate
        const transferDelegate = generateSigner(umi)
        const addTransferDelegateArgs: AddPluginArgs =  {
            asset: asset.publicKey,
            collection: collection.publicKey,
            plugin: {
                type: "TransferDelegate",
                authority: { 
                    type: 'Address', 
                    address: transferDelegate.publicKey
                },
            },
        };
        await addPlugin(umi, addTransferDelegateArgs).sendAndConfirm(umi)
        asset = await fetchAsset(umi, assetSigner.publicKey)
        console.log("--- 1. Transfer authorithy added---")
        console.log(`Transfer authority ${transferDelegate.publicKey}`)
        console.log(asset)

        // remove transfer delegate
        const revokeTransferDelegateArgs: RevokePluginAuthorityArgs = {
            asset: asset.publicKey,
            collection: collection.publicKey,
            authority: signer, // the owner
            plugin: { type: "TransferDelegate" },
            
        }
        await revokePluginAuthority(umi, revokeTransferDelegateArgs).sendAndConfirm(umi)
        asset = await fetchAsset(umi, assetSigner.publicKey)
        console.log("--- 2. Revoked Transfer Delegate ---")
        console.log(asset)

        // update transfer delegate authority
        const transferDelegate2 = generateSigner(umi)
        const approvePluginAuthorityArgs: ApprovePluginAuthorityArgs = {
            asset: asset.publicKey,
            collection: collection.publicKey,
            authority: signer, // the owner
            newAuthority: { type: 'Address', address: transferDelegate2.publicKey},
            plugin: { type: "TransferDelegate" },
        };
        await approvePluginAuthority(umi, approvePluginAuthorityArgs).sendAndConfirm(umi)
        asset = await fetchAsset(umi, assetSigner.publicKey)
        console.log("--- 3. New transfer delegate ---")
        console.log(`New transfer authority ${transferDelegate2.publicKey}`)
        console.log(asset)
    })
    */

    it("Try owner remove transfer delegate raises", async () => {
        // Create asset 
        let asset = await createAsset()
        const assetPubkey = new anchor.web3.PublicKey(asset.publicKey.toString());
        const collection = await fetchCollection(umi, collectionSigner.publicKey);

        // Create asset auction
        await program.methods
            .createAssetAuction(createAssetAuctionArgs.durationMinutes, createAssetAuctionArgs.minBid)
            .accountsPartial({config: auctionConfigPDA})
            .accounts({
                coreCollection: collectionPubkey,
                coreAsset: assetPubkey,
            })
            .rpc();

        // try revoke transfer delegate
        const revokeTransferDelegateArgs: RevokePluginAuthorityArgs = {
            asset: asset.publicKey,
            collection: collection.publicKey,
            authority: signer, // the owner
            plugin: { type: "TransferDelegate" },
            
        }

        let revoke_failed = false;
        try {
            await revokePluginAuthority(umi, revokeTransferDelegateArgs).sendAndConfirm(umi)
        } catch (error) {
            console.log(error)
            if (error instanceof NoApprovalsError) {
                revoke_failed = true
            }
        } finally {
           assert(revoke_failed, "Transfer delegate was updated by owner.")
        }

        // try to remove transfer delegate plugin
        const removePluginArgs: RemovePluginArgs = {
            asset: asset.publicKey,
            collection: collection.publicKey,
            authority: signer,  // owner
            plugin: { type: 'TransferDelegate' },
        }

        let remove_failed = false;
        try {
            await removePlugin(umi, removePluginArgs).sendAndConfirm(umi)
        } catch (error) {
            if (error instanceof InvalidAuthorityError) {
                remove_failed = true
            }
        } finally {
           assert(remove_failed, "Transfer delegate plugin was removed by owner.")
        }
    })

    it("Try create double asset auction raises", async() => {
        // Create asset 
        let asset = await createAsset()
        const assetPubkey = new anchor.web3.PublicKey(asset.publicKey.toString());
        
        // Create asset auction
        await program.methods
            .createAssetAuction(createAssetAuctionArgs.durationMinutes, createAssetAuctionArgs.minBid)
            .accountsPartial({config: auctionConfigPDA})
            .accounts({
                coreCollection: collectionPubkey,
                coreAsset: assetPubkey,
            })
            .rpc();

        // should fail because of asset auction pda is already in use
        let failed = false;
        try {
            await program.methods
                .createAssetAuction(createAssetAuctionArgs.durationMinutes, createAssetAuctionArgs.minBid)
                .accountsPartial({config: auctionConfigPDA})
                .accounts({
                    coreCollection: collectionPubkey,
                    coreAsset: assetPubkey,
                })
                .rpc();
        } catch (error) {
            if (error instanceof SendTransactionError.SendTransactionError) {
                failed = true
            }
        } finally {
            assert(failed)
        }
    });

    it("Try create asset auction on frozen asset raises", async() => {
        // Create asset 
        let asset = await createAsset()
        const assetPubkey = new anchor.web3.PublicKey(asset.publicKey.toString());
        const collection = await fetchCollection(umi, collectionSigner.publicKey);

        // freeze asset
        const freezeAssetArgs = {
            asset: asset,
            collection: collection,
            delegate: signer
        };
        await freezeAsset(umi, freezeAssetArgs).sendAndConfirm(umi);

        // verify its frozen
        asset = await fetchAsset(umi, asset.publicKey)
        assert(isFrozen(asset));
        
        // should fail because of frozen asset
        let failed = false;
        try {
            await program.methods
                .createAssetAuction(createAssetAuctionArgs.durationMinutes, createAssetAuctionArgs.minBid)
                .accountsPartial({config: auctionConfigPDA})
                .accounts({
                    coreCollection: collectionPubkey,
                    coreAsset: assetPubkey,
                })
                .rpc();
        } catch (error) {
            if (error instanceof AnchorError) {
                assert(error.error.errorCode.code === "FrozenAsset")
                failed = true
            }
        } finally {
            assert(failed)
        }
    });

    it("Try create asset auction on unfrozen asset with freeze delegate raises", async() => {
        // Create asset 
        let asset = await createAsset()
        const assetPubkey = new anchor.web3.PublicKey(asset.publicKey.toString());
        const collection = await fetchCollection(umi, collectionSigner.publicKey);

        // freeze asset
        const freezeAssetArgs: FreezeAssetArgs = {
            asset: asset,
            collection: collection,
            delegate: signer
        };
        await freezeAsset(umi, freezeAssetArgs).sendAndConfirm(umi);

        // thaw asset
        asset = await fetchAsset(umi, asset.publicKey)
        const thawAssetArgs: ThawAssetArgs = {
            asset: asset,
            collection: collection,
            delegate: signer
        };
        await thawAsset(umi, thawAssetArgs).sendAndConfirm(umi);

        // update authority to new signer
        const freezeAuthority = generateSigner(umi)
        const approvePluginAuthorityArgs: ApprovePluginAuthorityArgs = {
            asset: asset.publicKey,
            collection: collection.publicKey,
            authority: signer,
            newAuthority: { type: 'Address', address: freezeAuthority.publicKey},
            plugin: { type: "FreezeDelegate" },
        };
        await approvePluginAuthority(umi, approvePluginAuthorityArgs).sendAndConfirm(umi)

        // should fail because of frozen asset
        let failed = false;
        try {
            await program.methods
                .createAssetAuction(createAssetAuctionArgs.durationMinutes, createAssetAuctionArgs.minBid)
                .accountsPartial({config: auctionConfigPDA})
                .accounts({
                    coreCollection: collectionPubkey,
                    coreAsset: assetPubkey,
                })
                .rpc();
        } catch (error) {
            if (error instanceof AnchorError) {
                assert(error.error.errorCode.code === "FreezeDelegateNotOwner")
                failed = true
            }
        } finally {
            assert(failed)
        }
    });

    it("Try create asset auction on asset with transfer delegate raises", async() => {
        // Create asset 
        let asset = await createAsset()
        const assetPubkey = new anchor.web3.PublicKey(asset.publicKey.toString());
        const collection = await fetchCollection(umi, collectionSigner.publicKey);

        // add transfer delegate
        const transferDelegate = generateSigner(umi)
        const addTransferDelegateArgs: AddPluginArgs =  {
            asset: asset.publicKey,
            collection: collection.publicKey,
            plugin: {
                type: "TransferDelegate",
                authority: { 
                    type: 'Address', 
                    address: transferDelegate.publicKey
                },
            },
        };
        await addPlugin(umi, addTransferDelegateArgs).sendAndConfirm(umi)
        
        // should fail because of existing transfer delegate
        let failed = false;
        try {
            await program.methods
                .createAssetAuction(createAssetAuctionArgs.durationMinutes, createAssetAuctionArgs.minBid)
                .accountsPartial({config: auctionConfigPDA})
                .accounts({
                    coreCollection: collectionPubkey,
                    coreAsset: assetPubkey,
                })
                .rpc();
        } catch (error) {
            if (error instanceof AnchorError) {
                assert(error.error.errorCode.code === "TransferDelegateNotOwner")
                failed = true
            }
        } finally {
            assert(failed)
        }
    });

});

