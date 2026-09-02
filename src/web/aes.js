import { bytesToSaltedBase64, saltedBase64ToBytes } from './base64.js'

const IV_LENGTH = 12;
const KEY_LENGTH = 256;
const ALGORITHM = "AES-GCM";
const MODE_ENCRYPT = "encrypt";
const MODE_DECRYPT = "decrypt";

const importAESKey = (keyString, usage) => window.crypto.subtle.importKey(
    "raw",
    saltedBase64ToBytes(keyString),
    ALGORITHM,
    false,
    [usage]
);

export const generateAESKey = async () => {
    const key = await window.crypto.subtle.generateKey(
        {
            name: ALGORITHM,
            length: KEY_LENGTH,
        },
        true, // whether the key is extractable (can be exported)
        [MODE_ENCRYPT, MODE_DECRYPT]
    );
    const exported = await window.crypto.subtle.exportKey("raw", key);
    return bytesToSaltedBase64(exported);
};

export const encryptText = async (plaintext, keyString) => {
    const key = await importAESKey(keyString, MODE_ENCRYPT);
    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    const ciphertextBuffer = await window.crypto.subtle.encrypt(
        {
            name: ALGORITHM,
            iv: iv,
        },
        key,
        data
    );

    const combined = new Uint8Array(iv.byteLength + ciphertextBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ciphertextBuffer), iv.byteLength);
    return bytesToSaltedBase64(combined);
};

export const decryptText = async (encryptedString, keyString) => {
    const key = await importAESKey(keyString, MODE_DECRYPT);
    const combined = saltedBase64ToBytes(encryptedString);
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertextBuffer = combined.slice(IV_LENGTH);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
            name: ALGORITHM,
            iv: iv,
        },
        key,
        ciphertextBuffer
    );

    return new TextDecoder().decode(decryptedBuffer);
};
