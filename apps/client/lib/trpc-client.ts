import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@youtube/server/src/trpc/router";

const TRPC_URL =
    process.env.NEXT_PUBLIC_TRPC_URL || "http://localhost:4000/trpc";

export const trpcClient = createTRPCClient<AppRouter>({
    links: [
        httpBatchLink({
            url: TRPC_URL,
            transformer: superjson,
            fetch(url, options) {
                return fetch(url, {
                    ...options,
                    credentials: "include",
                });
            },
        }),
    ],
});
