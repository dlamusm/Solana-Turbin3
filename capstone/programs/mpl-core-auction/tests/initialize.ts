import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import assert from "assert";

import { MplCoreAuction } from "../target/types/mpl_core_auction";


describe("anchor auction initialization", () => {

    // Configure provider
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    // configure program
    const program = anchor.workspace.MplCoreAuction as Program<MplCoreAuction>;

    // Initialization params
    const initParams = {
        feeBPS: 100,
        minDurationMin: 60,
        maxDurationMin: 14400,
    };

    // get auction pda
    const [auctionConfigPDA, bump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("auction_config")],
        program.programId,
    );

    // get auction tresuary pda
    const [_1, tresuaryBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("auction_tresuary"), auctionConfigPDA.toBuffer()],
        program.programId,
    );

    // get auction tresuary pda
    const [_2, vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("auction_vault"), auctionConfigPDA.toBuffer()],
        program.programId,
    );

    it("Is initialized!", async () => {
        // initialize
        const tx = await program.methods
            .initialize(initParams.feeBPS, initParams.minDurationMin, initParams.maxDurationMin)
            .rpc(); 

        // fetch auction pda
        const auction_config = await program.account.auctionConfig.fetch(auctionConfigPDA);

        // verify values
        assert(auction_config.admin.toBase58() === provider.wallet.publicKey.toBase58());
        assert(auction_config.feeBps === initParams.feeBPS);
        assert(auction_config.minDurationMin === initParams.minDurationMin);
        assert(auction_config.maxDurationMin === initParams.maxDurationMin);
        assert(auction_config.tresuaryBump === tresuaryBump);
        assert(auction_config.vaultBump === vaultBump);
        assert(auction_config.bump === bump);
    });
});
