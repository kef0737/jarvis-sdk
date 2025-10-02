export async function request(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) {
        throw new Error(`Request failed: ${res.status} ${res.statusText}`);
    }
    return res;
}
