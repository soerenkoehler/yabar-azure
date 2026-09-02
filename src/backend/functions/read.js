import { app } from '@azure/functions';
import { authorizeRequest } from './auth.js';
import { throwHttpError } from './http.js';
import { getClient } from './client.js';

app.http('read', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Processing message read request for URL: ${request.url}`);

        try {
            const roles = await authorizeRequest(request, context);

            // when authorizeRequest succeedes we are fine to proceed

            const body = await request.json();

            const expiration = body?.expiration;
            if (!expiration) {
                throwHttpError(400, "Missing 'expiration' property.");
            }

            const id = body?.id;
            if (!id) {
                throwHttpError(400, "Missing 'id' property.");
            }

            const client = await getClient();

            try {
                const value = await client.read(expiration, id);

                await client.delete(expiration, id);

                return {
                    status: 200,
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
                    body: value
                };
            } catch (error) {
                if (error.message.includes('Unsupported expiration')) {
                    throwHttpError(400, error.message);
                }
                if (error.message.includes('not found')) {
                    throwHttpError(404, 'Message not found.');
                }
                throw error;
            }
        } catch (error) {
            context.error(`Failed to process request: ${error.message}`);

            if (error?.cause?.status) {
                return error.cause;
            }

            return {
                status: 500,
                body: 'Internal server error.'
            };
        }
    }
});
