const throwHttpError = (status, message) => {
    throw new Error(message, {
        cause: {
            status,
            jsonBody: message
        }
    });
};

export { throwHttpError };
