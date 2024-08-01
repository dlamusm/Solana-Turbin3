import { Commitment, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js"
import wallet from "../wba-wallet.json"
import { getOrCreateAssociatedTokenAccount, transfer } from "@solana/spl-token";

// We're going to import our keypair from the wallet file
const keypair = Keypair.fromSecretKey(new Uint8Array(wallet));

//Create a Solana devnet connection
const commitment: Commitment = "confirmed";
const connection = new Connection("https://api.devnet.solana.com", commitment);

// Mint address
const mint = new PublicKey("FZ9sFiXCC292UfhTwhxDyp7j7zK6oNuYRCSCrBU41aqu");

// Recipient address
const to = new PublicKey("Cw6V9LeFeSfLsBhtBQpq7PV6KVVr61XVdMuGmf9siTeu");

(async () => {
    try {
        // Get the token account of the fromWallet address, and if it does not exist, create it
        let fromAccount = await getOrCreateAssociatedTokenAccount(connection, keypair, mint, keypair.publicKey)

        // Get the token account of the toWallet address, and if it does not exist, create it
        let toAccount = await getOrCreateAssociatedTokenAccount(connection, keypair, mint, to)
        console.log(`Target pda ${toAccount.address.toBase58()}`)

        // Transfer the new token to the "toTokenAccount" we just created
        let tx = await transfer(connection, keypair, fromAccount.address, toAccount.address, keypair, 1)
        console.log(`Transfer tx ${tx}`)
    } catch(e) {
        console.error(`Oops, something went wrong: ${e}`)
    }
})();