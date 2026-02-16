import { createTRPCProxyClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "@youtube/server/src/trpc/router";
import { cookies } from "next/headers";

const TRPC_URL =
    process.env.NEXT_PUBLIC_TRPC_URL || "http://localhost:4000/trpc";

export const trpcServer = createTRPCProxyClient<AppRouter>({
    links: [
        httpBatchLink({
            url: TRPC_URL,
            transformer: superjson,
            async headers() {
                const cookieStore = await cookies();
                return {
                    cookie: cookieStore.toString(),
                };
            },
        }),
    ],
});
