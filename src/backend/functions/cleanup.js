import { app } from '@azure/functions';
import { getClient } from './client.js';

app.timer('cleanup', {
    schedule: '0 * * * * *',
    handler: async (timer, context) => {
        try {
            const client = await getClient();
            await client.cleanup();
            context.log('Scheduled cleanup finished.');
        } catch (error) {
            context.error(`Scheduled cleanup failed: ${error.message}`);
            throw error;
        }
    }
});