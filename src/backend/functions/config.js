import { app } from '@azure/functions';
import { getClient } from './client.js';

app.http('config', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Processing config request for URL: ${request.url}`);

        try {
            const client = await getClient();
            const config = await client.config();

            return {
                status: 200,
                jsonBody: config
            };
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