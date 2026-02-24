"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, wsLink, splitLink, createWSClient } from "@trpc/client";
import superjson from "superjson";
import { useState } from "react";
import { trpc } from "../lib/trpc";
import { ThemeProvider } from "./theme-provider";
import { Toaster } from "sonner";

const TRPC_URL =
    process.env.NEXT_PUBLIC_TRPC_URL || "http://localhost:4000/trpc";

// Browser HTTP requests go through the same-origin proxy to forward cookies.
// The session cookie is on the client domain, so cross-origin requests to the
// API server won't include it. The proxy at /api/trpc forwards cookies.
const BROWSER_TRPC_URL = typeof window !== "undefined" ? "/api/trpc" : TRPC_URL;

import { TooltipProvider } from "@/components/ui/tooltip";

export default function Providers({ children }: { children: React.ReactNode }) {
    const [queryClient] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        staleTime: 5 * 60 * 1000, // 5 minutes
                        refetchOnWindowFocus: false,
                    },
                },
            }),
    );

    const [trpcClient] = useState(() =>
        trpc.createClient({
            links: [
                splitLink({
                    condition: (op) => op.type === "subscription",
                    true:
                        typeof window !== "undefined"
                            ? wsLink({
                                  client: createWSClient({
                                      url:
                                          typeof window !== "undefined"
                                              ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/api/ws`
                                              : process.env
                                                    .NEXT_PUBLIC_WS_URL ||
                                                "ws://localhost:4000",
                                  }),
                                  transformer: superjson,
                              })
                            : httpBatchLink({
                                  url: TRPC_URL,
                                  transformer: superjson,
                              }),
                    false: httpBatchLink({
                        url: BROWSER_TRPC_URL,
                        transformer: superjson,
                    }),
                }),
            ],
        }),
    );

    return (
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
                <ThemeProvider
                    attribute="class"
                    defaultTheme="system"
                    enableSystem
                    disableTransitionOnChange
                >
                    <TooltipProvider>
                        {children}
                        <Toaster position="top-right" richColors />
                    </TooltipProvider>
                </ThemeProvider>
            </QueryClientProvider>
        </trpc.Provider>
    );
}
