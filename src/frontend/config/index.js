const getEnvironmentValue = (...keys) => {
    for (const key of keys) {
        const value = process.env[key];
        if (typeof value === 'string' && value.trim() !== '') {
            return value.trim();
        }
    }

    return '';
};

export const run = async (context) => {
    const backendHostname = getEnvironmentValue(
        'backend_hostname',
        'BACKEND_HOSTNAME'
    );

    context.res = {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
        },
        body: {
            backend_hostname: backendHostname || 'http://localhost:7071'
        }
    };
};
