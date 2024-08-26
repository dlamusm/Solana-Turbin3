import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";

import {MplCoreAuction} from "../target/types/mpl_core_auction";


describe("anchor auction initialization", () => {

    // Configure provider
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
   
    // configure program
    const program = anchor.workspace.AnchorCounter as Program<MplCoreAuction>;

    // Initialization params
    const initParams = {
        feeBPS: 100,
        minDurationMin: 60,
        maxDurationMin: 14400,
    }

    // get auction pda
    const [auctionConfigPDA, bump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("auction_config")],
        program.programId,
      );
   
    it("Is initialized!", async () => {
        // initialize
        const tx = await program.methods
            .initialize(initParams.feeBPS, initParams.minDurationMin, initParams.maxDurationMin)
            .rpc();

        // fetch auction pda
        const auction = await program.account.auctionConfig.fetch(auctionConfigPDA);
        
        // verify values
        expect(auction.admin === provider.wallet.publicKey);
        expect(auction.feeBps === initParams.feeBPS);
        expect(auction.minDurationMin === initParams.minDurationMin);
        expect(auction.maxDurationMin === initParams.maxDurationMin);
        expect(auction.bump === bump);
    });

});
