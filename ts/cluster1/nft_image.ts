import wallet from "../wba-wallet.json"
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults"
import { createGenericFile, createSignerFromKeypair, signerIdentity } from "@metaplex-foundation/umi"
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys"
import { readFile } from "fs/promises"
import path from "path"

// Create a devnet connection
const umi = createUmi('https://api.devnet.solana.com');

let keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(wallet));
const signer = createSignerFromKeypair(umi, keypair);

umi.use(irysUploader());
umi.use(signerIdentity(signer));

(async () => {
    try {
        //1. Load image
        let img_path = path.join(__dirname, "images", "generug.png")
        console.log(img_path)
        const imageFile = await readFile(img_path);

        //2. Convert image to generic file.
        const umiImageFile = createGenericFile(
            imageFile,
            "bluerug.jpg",
            {tags: [{ name: "Content-Type", value: "image/jpeg" }]}
        );

        //3. Upload image
        // Uploaded https://arweave.net/X0J1cVhNah_7jzMeGRP17Gun-Am8CJ3yNCOdDN03Fvo --> wif crown
        // Uploaded https://arweave.net/KQdWPTvssnhfJTb8qxc78hcx6kx28nv7NSrr-_flfJI --> rug
        const imageUri = await umi.uploader.upload([umiImageFile]);
        console.log("Your image URI: ", imageUri[0]);
    }
    catch(error) {
        console.log("Oops.. Something went wrong", error);
    }
})();
