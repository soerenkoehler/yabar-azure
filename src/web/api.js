import { currentIdToken } from './auth.js';

let cached = null;

const getRequestHeaders = () => {
    return currentIdToken ? {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentIdToken}`
    } : {};
};

export const apiClient = (backend_hostname) => {
    if (cached) {
        return cached;
    }

    const client = {
        config: async () => {
            const response = await fetch(
                `${backend_hostname}/api/config`,
                {
                    method: 'GET'
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error (${response.status}): ${errorText}`);
            }

            return response.json();
        },

        roles: async () => {
            const response = await fetch(
                `${backend_hostname}/api/roles`,
                {
                    method: 'GET',
                    headers: getRequestHeaders()
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error (${response.status}): ${errorText}`);
            }

            return response.json();
        },

        read: async (expiration, id) => {
            const response = await fetch(
                `${backend_hostname}/api/read`,
                {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({ expiration, id })
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error (${response.status}): ${errorText}`);
            }

            return response.text();
        },

        write: async (expiration, value) => {
            const response = await fetch(
                `${backend_hostname}/api/write`,
                {
                    method: 'POST',
                    headers: getRequestHeaders(),
                    body: JSON.stringify({ expiration, value })
                }
            );

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Error (${response.status}): ${errorText}`);
            }

            return response.text();
        }
    };

    cached = client;
    return cached;
};
