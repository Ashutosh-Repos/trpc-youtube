import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@youtube/server/src/trpc/router";

const TRPC_URL =
    process.env.NEXT_PUBLIC_TRPC_URL || "http://localhost:4000/trpc";

// Browser calls go through the same-origin proxy to forward session cookies
const CLIENT_URL = typeof window !== "undefined" ? "/api/trpc" : TRPC_URL;

export const trpcClient = createTRPCClient<AppRouter>({
    links: [
        httpBatchLink({
            url: CLIENT_URL,
            transformer: superjson,
        }),
    ],
});
