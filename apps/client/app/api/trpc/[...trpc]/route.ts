/**
 * tRPC Proxy Route
 *
 * Proxies tRPC HTTP requests to the API server, forwarding cookies.
 * This solves the cross-domain auth issue: session cookies are set on the
 * client domain but the API server is on a different domain. The browser
 * won't send cookies cross-domain, so we proxy through the client domain
 * where the cookies ARE available.
 */

const API_TRPC_URL = (
    process.env.INTERNAL_TRPC_URL ||
    process.env.NEXT_PUBLIC_TRPC_URL ||
    "http://localhost:4000/trpc"
).replace(/\/+$/, ""); // Strip trailing slash

async function handler(req: Request) {
    const url = new URL(req.url);

    // Extract the tRPC path after /api/trpc/
    const trpcPath = url.pathname.replace(/^\/api\/trpc\/?/, "");
    const targetUrl = trpcPath
        ? `${API_TRPC_URL}/${trpcPath}${url.search}`
        : `${API_TRPC_URL}${url.search}`;

    const headers: Record<string, string> = {
        "content-type": req.headers.get("content-type") || "application/json",
    };

    // Forward cookies (session token) to the API server
    const cookie = req.headers.get("cookie");
    if (cookie) headers["cookie"] = cookie;

    // Forward client IP for rate limiting
    const xff = req.headers.get("x-forwarded-for");
    if (xff) headers["x-forwarded-for"] = xff;

    const resp = await fetch(targetUrl, {
        method: req.method,
        headers,
        body:
            req.method !== "GET" && req.method !== "HEAD"
                ? req.body
                : undefined,
        // @ts-expect-error — Node fetch supports duplex for streaming request bodies
        duplex:
            req.method !== "GET" && req.method !== "HEAD" ? "half" : undefined,
    });

    // Forward the response back with CORS headers for same-origin
    const responseHeaders = new Headers();
    responseHeaders.set(
        "content-type",
        resp.headers.get("content-type") || "application/json",
    );

    // Forward set-cookie headers from API server (if any)
    const setCookie = resp.headers.get("set-cookie");
    if (setCookie) responseHeaders.set("set-cookie", setCookie);

    return new Response(resp.body, {
        status: resp.status,
        headers: responseHeaders,
    });
}

export { handler as GET, handler as POST };
