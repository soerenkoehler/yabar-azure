import { TIMESTAMP } from './version.generated.js';
import { app } from '@azure/functions';

app.http(`info`, {
    methods: ['GET'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        context.log(`Processing request for URL: ${request.url}`);
        return {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `build timestamp = ${TIMESTAMP}` })
        };
    }
});
