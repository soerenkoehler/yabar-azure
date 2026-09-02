import { OAuth2Client } from 'google-auth-library';
import { throwHttpError } from './http.js';
import { getClient } from './client.js';

export const authorizeRequest = async (request, context) => {
    const authHeader = request.headers.get('authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throwHttpError(401, 'Unauthorized: Missing or malformed Bearer token.');
    }

    const token = authHeader.split(' ')[1];

    try {
        const client = await getClient();

        const config = await client.config();
        const authGoogleClientId = String(config?.auth_google_client_id ?? '').trim();
        if (!authGoogleClientId) {
            throw new Error("Missing 'auth_google_client_id' in config.");
        }

        const authClient = new OAuth2Client(authGoogleClientId);
        const ticket = await authClient.verifyIdToken({
            idToken: token,
            audience: authGoogleClientId,
        });

        const payload = ticket.getPayload();
        const userEmail = payload.email;
        const isEmailVerified = payload.email_verified;

        if (!isEmailVerified || !userEmail) {
            context.log(`Unauthorized access attempt by: ${userEmail}`);
            throwHttpError(401, 'Unauthorized: Email is not verified.');
        }

        const users = await client.users();
        return users?.[userEmail] ?? [];
    } catch (error) {
        if (error?.cause?.status) {
            throw error;
        }

        context.error('Token validation failed:', error.message);
        throwHttpError(401, 'Unauthorized: Invalid or expired token.');
    }
};
