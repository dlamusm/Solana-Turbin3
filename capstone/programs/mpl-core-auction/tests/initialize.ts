import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import assert from "assert";

import { MplCoreAuction } from "../target/types/mpl_core_auction";


describe("Auction initialization", () => {

    // Configure provider
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);

    // configure program
    const program = anchor.workspace.MplCoreAuction as Program<MplCoreAuction>;

    // Initialization params
    const initParams = {
        seed: 1,
        feeBPS: 100,
        minDurationMinutes: 60,
        maxDurationMinutes: 14400,
    };

    // get auction pda
    const [auctionConfigPDA, bump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("config"), new BN(initParams.seed).toArrayLike(Buffer, "le", 4)],
        program.programId,
    );

    // get auction tresuary pda
    const [_1, tresuaryBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("tresuary"), auctionConfigPDA.toBuffer()],
        program.programId,
    );

    // get auction vault pda
    const [_2, vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), auctionConfigPDA.toBuffer()],
        program.programId,
    );

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

        // fetch auction pda
        const auction_config = await program.account.config.fetch(auctionConfigPDA);

        // verify values
        assert(auction_config.seed === initParams.seed);
        assert(auction_config.admin.toBase58() === provider.wallet.publicKey.toBase58());
        assert(auction_config.feeBps === initParams.feeBPS);
        assert(auction_config.minDurationMinutes === initParams.minDurationMinutes);
        assert(auction_config.maxDurationMinutes === initParams.maxDurationMinutes);
        assert(auction_config.vaultBump === vaultBump);
        assert(auction_config.tresuaryBump === tresuaryBump);
        assert(auction_config.bump === bump);
    });
});
