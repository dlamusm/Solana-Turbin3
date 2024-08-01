import wallet from "../wba-wallet.json"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { createGenericFile, createSignerFromKeypair, signerIdentity } from "@metaplex-foundation/umi"
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys"

// Create a devnet connection
const umi = createUmi('https://api.devnet.solana.com');

let keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(wallet));
const signer = createSignerFromKeypair(umi, keypair);

umi.use(irysUploader());
umi.use(signerIdentity(signer));

(async () => {
    try {
        // Follow this JSON structure
        // https://docs.metaplex.com/programs/token-metadata/changelog/v1.0#json-structure
        // Uploaded https://arweave.net/jnFo9xeZNc8xtslwHX9NAlW-CjUsDSnaXofAfHVcZac -> rug metadata

        const image = "https://arweave.net/KQdWPTvssnhfJTb8qxc78hcx6kx28nv7NSrr-_flfJI"
        const metadata = {
            name: "Diego's Super Rug",
            symbol: "DSR",
            description: "A blue rug",
            image: image,
            attributes: [
                {trait_type: 'fly_speed', value: '100'},
                {trait_type: 'dirt_amount', value: '30'}
            ],
            properties: {
                files: [
                    {
                         type: "image/png",
                         uri: "image"
                     },
                 ]
             },
             creators: [keypair.publicKey]
        };
        const myUri = await umi.uploader.uploadJson(metadata)
        console.log("Your image URI: ", myUri);
    }
    catch(error) {
        console.log("Oops.. Something went wrong", error);
    }
})();
