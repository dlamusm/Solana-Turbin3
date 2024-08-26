import { Keypair } from "@solana/web3.js";
import bs58 from 'bs58'


let wallet = Keypair.generate()

console.log(`Your public key bs58 is:\n${wallet.publicKey.toBase58()}`)
console.log(`Your private key is:\n[${wallet.secretKey}]`)
console.log(`Your private key bs58 is:\n${bs58.encode(wallet.secretKey)}`)
