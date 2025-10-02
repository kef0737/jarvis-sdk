let cachedToken = null;
let tokenExpiry = null;
/**
 * Returns the Authorization header. Uses API key if provided,
 * otherwise uses a cached JWT token and refreshes if expired.
 */
export async function getAuthHeader(options) {
    if (options === null || options === void 0 ? void 0 : options.apiKey) {
        return { Authorization: `Bearer ${options.apiKey}` };
    }
    if (options === null || options === void 0 ? void 0 : options.getToken) {
        const now = Date.now();
        if (!cachedToken || !tokenExpiry || now >= tokenExpiry) {
            const { token, expiresIn } = await options.getToken();
            cachedToken = token;
            tokenExpiry = now + expiresIn * 1000 - 5000; // refresh 5s before expiry
        }
        return { Authorization: `Bearer ${cachedToken}` };
    }
    return {};
}
