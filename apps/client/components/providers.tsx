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
                                          process.env.NEXT_PUBLIC_WS_URL ||
                                          "ws://localhost:4000",
                                  }),
                                  transformer: superjson,
                              })
                            : httpBatchLink({
                                  url: TRPC_URL,
                                  transformer: superjson,
                              }),
                    false: httpBatchLink({
                        url: TRPC_URL,
                        transformer: superjson,
                        fetch(url, options) {
                            return fetch(url, {
                                ...options,
                                credentials: "include",
                            });
                        },
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
