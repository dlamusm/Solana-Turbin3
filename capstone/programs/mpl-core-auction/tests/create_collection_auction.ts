import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { createCollection, fetchCollection, mplCore } from '@metaplex-foundation/mpl-core'
import { createSignerFromKeypair, signerIdentity, generateSigner} from '@metaplex-foundation/umi'
import NodeWallet from "@coral-xyz/anchor/dist/cjs/nodewallet";
import assert from "assert";

import { MplCoreAuction } from "../target/types/mpl_core_auction";


describe("Collection Whitelisting", () => {

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
        seed: 2,
        feeBPS: 100,
        minDurationMinutes: 60,
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

    before("Intialize auction", async () => {
        await program.methods
            .initialize(
                initParams.seed,
                initParams.feeBPS,
                initParams.minDurationMinutes,
                initParams.maxDurationMinutes
            )
            .rpc(); 
    });

    before("Create collection", async () => {
        await createCollection(umi, collectionArgs).sendAndConfirm(umi);

        // verify collection exists
        const collection = await fetchCollection(umi, collectionSigner.publicKey);
        assert(collection.publicKey == collectionSigner.publicKey);
    });

    it("create collection auction", async () => {
        // create collection auction
        await program.methods
            .createCollectionAuction()
            .accountsPartial({config: auctionConfigPDA})
            .accounts({collection: collectionPubkey})
            .rpc();
        
        // get collection auction account pda
        const [auctionCollectionPDA, bump] = anchor.web3.PublicKey.findProgramAddressSync(
            [Buffer.from("collection"), auctionConfigPDA.toBuffer(), collectionPubkey.toBuffer()],
            program.programId,
        );

        // fetch collection auction pda
        const collection_auction = await program.account.collectionAuction.fetch(auctionCollectionPDA);

        // verify values
        assert(collection_auction.collection.toBase58() === collectionPubkey.toBase58());
        assert(collection_auction.bump === bump);
    });

});
