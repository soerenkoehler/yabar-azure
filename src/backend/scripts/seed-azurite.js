#!/usr/bin/env node
/**
 * Seed script for local Azurite storage.
 * Mirrors the production resources defined in src/tf/30-storage.tf.
 *
 * Requires users.json in the same directory (git-ignored).
 * Reads connection strings from local.settings.json (BlobConnectionString /
 * TableConnectionString), falling back to the Azurite default connection string.
 */

import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BlobServiceClient } from '@azure/storage-blob';
import { TableClient } from '@azure/data-tables';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = join(__dirname, '..', 'local.settings.json');
const USERS_PATH = join(__dirname, 'users.json');
const CONFIG_PATH = join(__dirname, 'config.json');

// --------------------------------------------------------------------------
// Config
// --------------------------------------------------------------------------

const APP_DATA_CONTAINER = 'appdata';
const TABLE_NAME = 'messages';

const CONFIG_BLOB_DEFAULTS = {
    auth_google_client_id: '',
    expiration_options: [
        {
            "value": "PT1M",
            "label": "1min",
            "allowOneClick": true
        },
        {
            "value": "PT15M",
            "label": "15min",
            "allowOneClick": false
        },
        {
            "value": "PT1H",
            "label": "1 Hour",
            "allowOneClick": false
        }
    ],
};

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

const loadConfig = async () => {
    try {
        const raw = await readFile(CONFIG_PATH, 'utf8');
        const overrides = JSON.parse(raw);
        const merged = { ...CONFIG_BLOB_DEFAULTS, ...overrides };
        console.log('  Loaded config overrides from config.json');
        return merged;
    } catch (err) {
        if (err.code !== 'ENOENT') {
            throw new Error(`Failed to parse config.json: ${err.message}`);
        }
        return CONFIG_BLOB_DEFAULTS;
    }
}

const loadConnectionStrings = async () => {
    try {
        const raw = await readFile(SETTINGS_PATH, 'utf8');
        const settings = JSON.parse(raw);
        const values = settings?.Values ?? {};
        return {
            blob:  values.BlobConnectionString,
            table: values.TableConnectionString,
        };
    } catch {
        console.warn('Could not read local.settings.json, using Azurite defaults.');
        return { blob: AZURITE_DEFAULT_CONNECTION_STRING, table: AZURITE_DEFAULT_CONNECTION_STRING };
    }
}

const loadUsers = async () => {
    try {
        const raw = await readFile(USERS_PATH, 'utf8');
        return JSON.parse(raw);
    } catch (err) {
        if (err.code === 'ENOENT') {
            throw new Error(`users.json not found at ${USERS_PATH}. Create it with your user entries.`);
        }
        throw new Error(`Failed to parse users.json: ${err.message}`);
    }
}

const ensureContainer = async (blobServiceClient, containerName) => {
    const container = blobServiceClient.getContainerClient(containerName);
    const created = await container.createIfNotExists();
    if (created.succeeded) {
        console.log(`  Created container: ${containerName}`);
    } else {
        console.log(`  Container already exists: ${containerName}`);
    }
    return container;
}

const uploadBlob = async (container, name, content, contentType) => {
    const blockBlobClient = container.getBlockBlobClient(name);
    const buffer = Buffer.from(content, 'utf8');
    await blockBlobClient.upload(buffer, buffer.length, {
        blobHTTPHeaders: { blobContentType: contentType },
        overwrite: true,
    });
    console.log(`  Uploaded blob: ${name}`);
}

const ensureTable = async (connectionString, tableName) => {
    const tableClient = TableClient.fromConnectionString(connectionString, tableName);
    try {
        await tableClient.createTable();
        console.log(`  Created table: ${tableName}`);
    } catch (err) {
        if (err.statusCode === 409) {
            console.log(`  Table already exists: ${tableName}`);
        } else {
            throw err;
        }
    }
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

const main = async () => {
    console.log('Seeding Azurite storage...\n');

    const { blob: blobConnStr, table: tableConnStr } = await loadConnectionStrings();
    const [users, config] = await Promise.all([loadUsers(), loadConfig()]);

    const blobServiceClient = BlobServiceClient.fromConnectionString(blobConnStr);

    // --- appdata container + blobs ---
    console.log('Storage container: appdata');
    const appData = await ensureContainer(blobServiceClient, APP_DATA_CONTAINER);
    await uploadBlob(appData, 'config', JSON.stringify(config), 'application/json');
    await uploadBlob(appData, 'users', JSON.stringify(users), 'application/json');

    // --- messages table ---
    console.log('\nStorage table: messages');
    await ensureTable(tableConnStr, TABLE_NAME);

    console.log('\nSeed complete.');
}

main().catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
});
