import { app } from '@azure/functions';
import { authorizeRequest } from './auth.js';

app.http('roles', {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Processing roles request for URL: ${request.url}`);

        try {
            const roles = await authorizeRequest(request, context);

            return {
                status: 200,
                jsonBody: {
                    roles: Array.isArray(roles) ? roles : []
                }
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
