import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { createSignerFromKeypair, signerIdentity, createGenericFile, createGenericFileFromJson, generateSigner} from '@metaplex-foundation/umi'
import { create } from '@metaplex-foundation/mpl-core'
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys"
import { readFile } from "fs/promises"
import wallet from '../wallet.json'
import path from 'path'

// config
const RPC_ENDPOINT = "https://api.devnet.solana.com";
const IMAGE_FILE = `${path.dirname(__dirname)}/images/dog-wif-crown-1.jpg`;
const TARGET_IMAGE_FILE_NAME = "dog-wif-crown-1.jpg";
const ASSET_NAME = "Dog wif crown 1";
const ASSET_DESCRIPTION = "Dogs with crown NFT asset";
const ASSET_COLLECTION = ""  // modify pubkey

// Create a UMI connection
const umi = createUmi(RPC_ENDPOINT);
const keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(wallet));
const signer = createSignerFromKeypair(umi, keypair);
umi.use(signerIdentity(signer));
umi.use(irysUploader());

(async () => {
    // Upload asset image 
    const imageFileBuiffer = await readFile(IMAGE_FILE)
    const imageGenericFile = createGenericFile(
        imageFileBuiffer,
        TARGET_IMAGE_FILE_NAME,
        {tags: [{ name: "Content-Type", value: "image/jpeg" }]}
    );

    const imageUri = await umi.uploader.upload([imageGenericFile]);

    // Create off chain file
    const metadataJson = {
        name: ASSET_NAME,
        description: ASSET_DESCRIPTION,
        image: imageUri[0],
        properties: {
            files: [
                {
                    type: "image/jpg",
                    uri: imageUri[0]
                },
            ],
            category:"image"
        }
    };
    const offchainDataJsonGenericFile = createGenericFileFromJson(metadataJson)
    const offchainDataUri = await umi.uploader.upload([offchainDataJsonGenericFile]);

    console.log(`Asset image URI: ${imageUri[0]}`);
    console.log(`Asset offchain data URI: ${offchainDataUri[0]}`)

    // Create Asset
    const assetSigner = generateSigner(umi)
    const assetArgs = {
        asset: assetSigner,
        name: ASSET_NAME,
        uri: offchainDataUri[0],
    };

    const tx = await create(umi, assetArgs).sendAndConfirm(umi);

    console.log(`Asset pubkey: ${assetSigner.publicKey}`);

})();