import { TableClient } from '@azure/data-tables';
import { BlobServiceClient } from '@azure/storage-blob';
import { DefaultAzureCredential } from "@azure/identity";
import { Temporal } from '@js-temporal/polyfill'; // XXX required before node 26
import { randomUUID } from 'node:crypto';

let cached = null;

const APP_DATA_CONTAINER_NAME = 'appdata';
const CONFIG_BLOB_NAME = 'config';
const USERS_BLOB_NAME = 'users';

const generateRowKey = () => {
    return `${Date.now()}_${randomUUID()}`;
};

const parseDurationToMilliseconds = (duration) => {
    const normalized = String(duration ?? '').trim();
    if (!normalized) {
        return null;
    }

    try {
        const parsed = Temporal.Duration.from(normalized);
        const hasCalendarUnits = parsed.years !== 0 || parsed.months !== 0;
        if (hasCalendarUnits) {
            return null;
        }

        const total = parsed.total({ unit: 'milliseconds' });
        return Number.isFinite(total) && total > 0 ? total : null;
    } catch {
        return null;
    }
};

const parseTimestampFromRowKey = (rowKey) => {
    const [rawTimestamp] = String(rowKey ?? '').split('_');
    if (!/^\d+$/.test(rawTimestamp)) {
        return null;
    }

    const timestampMs = Number(rawTimestamp);
    if (!Number.isFinite(timestampMs) || timestampMs < 0) {
        return null;
    }

    const createdAt = new Date(timestampMs);
    if (Number.isNaN(createdAt.getTime())) {
        return null;
    }

    return createdAt;
};

const streamToString = async (readableStream) => {
    const chunks = [];
    for await (const chunk of readableStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks).toString('utf8');
};

const connect = (connectionString, fromEndpoint, fromConnectionString) => {
    if (!connectionString) {
        throw new Error('ConnectionString environment variable is not defined.');
    }

    const serviceClient = connectionString.startsWith('http')
        ? fromEndpoint(connectionString, new DefaultAzureCredential())
        : fromConnectionString(connectionString);

    return serviceClient;
}

export const getClient = async () => {
    if (cached) {
        return cached;
    }

    const tableName = 'messages';
    const messageTable = connect(
        process.env.TableConnectionString,
        (conn, cred) => new TableClient(conn, tableName, cred),
        (conn, cred) => TableClient.fromConnectionString(conn, tableName)
    );
    await messageTable.createTable();

    const appDataContainer = connect(
        process.env.BlobConnectionString,
        (conn, cred) => new BlobServiceClient(conn, cred),
        (conn, cred) => BlobServiceClient.fromConnectionString(conn)
    ).getContainerClient(APP_DATA_CONTAINER_NAME);
    await appDataContainer.createIfNotExists();

    const readJsonBlob = async (blobName) => {
        const blobClient = appDataContainer.getBlobClient(blobName);
        try {
            const download = await blobClient.download();
            const raw = await streamToString(download.readableStreamBody);
            return JSON.parse(raw);
        } catch (error) {
            if (error?.statusCode === 404) {
                throw new Error(`Blob '${blobName}' not found in container '${APP_DATA_CONTAINER_NAME}'.`);
            }
            if (error instanceof SyntaxError) {
                throw new Error(`Blob '${blobName}' contains invalid JSON.`);
            }
            throw error;
        }
    };

    const getAllowedExpirations = async () => {
        const config = await readJsonBlob(CONFIG_BLOB_NAME);
        const options = Array.isArray(config?.expiration_options) ? config.expiration_options : [];
        return new Set(options.map((option) => String(option?.value ?? '').trim()));
    };

    const validateExpiration = async (expiration) => {
        const normalized = String(expiration ?? '').trim();
        const allowedExpirations = await getAllowedExpirations();

        if (!allowedExpirations.has(normalized)) {
            throw new Error(
                `Unsupported expiration '${expiration}'`
            );
        }
        return normalized;
    };

    const countEntities = async (tableClient) => {
        let totalCount = 0;

        // Fetch page by page while selecting ONLY PartitionKey to minimize network overhead
        const pagedEntities = tableClient.listEntities({
            queryOptions: { select: ["PartitionKey"] }
        }).byPage({ maxPageSize: 1000 });

        for await (const page of pagedEntities) {
            totalCount += page.length;
        }

        return totalCount;
    }

    const client = {
        config: async () => {
            return readJsonBlob(CONFIG_BLOB_NAME);
        },

        users: async () => {
            return readJsonBlob(USERS_BLOB_NAME);
        },

        write: async (expiration, message) => {
            const partitionKey = await validateExpiration(expiration);
            const rowKey = generateRowKey();
            await messageTable.createEntity({
                partitionKey,
                rowKey,
                value: String(message),
                createdAt: new Date().toISOString()
            });
            return rowKey;
        },

        read: async (expiration, rowKey) => {
            const partitionKey = await validateExpiration(expiration);
            try {
                const entity = await messageTable.getEntity(partitionKey, rowKey);
                return entity.value ?? '';
            } catch (error) {
                if (error?.statusCode === 404) {
                    throw new Error(`Message with rowKey ${rowKey} not found.`);
                }
                throw error;
            }
        },

        delete: async (expiration, rowKey) => {
            const partitionKey = await validateExpiration(expiration);
            await messageTable.deleteEntity(partitionKey, rowKey);
        },

        cleanup: async () => {
            const allowedExpirations = await getAllowedExpirations();
            const durationByPartition = new Map();
            for (const expiration of allowedExpirations) {
                const durationMs = parseDurationToMilliseconds(expiration);
                if (durationMs != null) {
                    durationByPartition.set(expiration, durationMs);
                }
            }

            const now = Date.now();

            let beforeCount = 0;
            for await (const entity of messageTable.listEntities()) {
                beforeCount++;

                const partitionKey = String(entity.partitionKey ?? '');
                const rowKey = String(entity.rowKey ?? '');

                const durationMs = durationByPartition.get(partitionKey);
                if (durationMs != null) { // valid expiration?
                    const createdAt = parseTimestampFromRowKey(rowKey);
                    if (createdAt != null) { // valid timestamp?
                        const age = now - createdAt.getTime();
                        if (age <= durationMs) { // not expired?
                            continue;
                        }
                    }
                }

                await messageTable.deleteEntity(partitionKey, rowKey);
                console.log(`> Deleted message ${rowKey} from ${partitionKey}`);
            }

            console.log(`> Messages before cleanup: ${beforeCount}`);

            const afterCount = await countEntities(messageTable);
            console.log(`> Messages after cleanup: ${afterCount}`);
        }
    };

    cached = client;
    return cached;
};
