import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { createCollection, fetchCollection, mplCore } from '@metaplex-foundation/mpl-core'
import { createSignerFromKeypair, signerIdentity, generateSigner} from '@metaplex-foundation/umi'
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import assert from "assert";

import { MplCoreAuction } from "../target/types/mpl_core_auction";


describe("Collection Whitelisting", () => {

    // Configure provider
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);    

    // configure program
    const program = anchor.workspace.MplCoreAuction as Program<MplCoreAuction>;

    // Initialization params
    const initParams = {
        seed: 2,
        feeBPS: 100,
        minDurationMinutes: 60,
        maxDurationMinutes: 14400,
    };

    // Get auction config pda
    const [auctionConfigPDA, _] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("config"), new BN(initParams.seed).toArrayLike(Buffer, "le", 4)],
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

    it("Create collection", async () => {
        // Create collection
        await createCollection(umi, collectionArgs).sendAndConfirm(umi);

        // verify collection exists
        const collection = await fetchCollection(umi, collectionSigner.publicKey);
        assert(collection.publicKey == collectionSigner.publicKey);
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

        // get auction collection pda
        const [auctionCollectionPDA, bump] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("collection"), collectionPubkey.toBuffer()],
            program.programId,
        );

        // fetch auction pda
        const auction_collection = await program.account.collection.fetch(auctionCollectionPDA);

        // verify values
        assert(auction_collection.coreCollection = collectionPubkey);
        assert(auction_collection.bump === bump);
    });

});
