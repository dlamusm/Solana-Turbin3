import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { createSignerFromKeypair, signerIdentity, createGenericFile, createGenericFileFromJson, generateSigner} from '@metaplex-foundation/umi'
import { createCollection, fetchCollection } from '@metaplex-foundation/mpl-core'
import { irysUploader } from "@metaplex-foundation/umi-uploader-irys"
import { readFile } from "fs/promises"
import wallet from '../wallet.json'
import path from 'path'
import bs58 from 'bs58'

// config
const RPC_ENDPOINT = "https://api.devnet.solana.com";
const IMAGE_FILE = `${path.dirname(__dirname)}/images/dog-wif-crown-logo.jpg`;
const TARGET_IMAGE_FILE_NAME = "dog-wif-crown-logo.jpg";
const COLLECTION_NAME = "Dog wif crown";
const COLLECTION_SYMBOL = "DWC";
const COLLECTION_DESCRIPTION = "Dogs with crown NFT collection";

// Create a UMI connection
const umi = createUmi(RPC_ENDPOINT);
const keypair = umi.eddsa.createKeypairFromSecretKey(new Uint8Array(wallet));
const signer = createSignerFromKeypair(umi, keypair);
umi.use(signerIdentity(signer));
umi.use(irysUploader());

(async () => {
    // Upload collection image 
    const imageFileBuiffer = await readFile(IMAGE_FILE)
    const imageGenericFile = createGenericFile(
        imageFileBuiffer,
        TARGET_IMAGE_FILE_NAME,
        {tags: [{ name: "Content-Type", value: "image/jpeg" }]}
    );

    const imageUri = await umi.uploader.upload([imageGenericFile]);

    // Create off chain file
    const metadataJson = {
        name: COLLECTION_NAME,
        symbol: COLLECTION_SYMBOL,
        description: COLLECTION_DESCRIPTION,
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

    console.log(`Collection image URI: ${imageUri[0]}`);
    console.log(`Collection offchain data URI: ${offchainDataUri[0]}`)

    // Create collection
    const collectionSigner = generateSigner(umi)
    const collectionArgs = {
        collection: collectionSigner,
        name: COLLECTION_NAME,
        uri: offchainDataUri[0],
    };

    const tx = await createCollection(umi, collectionArgs).sendAndConfirm(umi);
    console.log(`Transaction signature: ${bs58.encode(Buffer.from(tx.signature))}`)

    // fetch collection
    const collection = await fetchCollection(umi, collectionSigner.publicKey)
    console.log('Collection:')
    console.log(collection)

})();