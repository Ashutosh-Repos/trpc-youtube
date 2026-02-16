import { inferAsyncReturnType } from "@trpc/server";
import * as trpcExpress from "@trpc/server/adapters/express";
import { CreateWSSContextFnOptions } from "@trpc/server/adapters/ws";
import { auth } from "../lib/auth";
import { fromNodeHeaders } from "better-auth/node";

/**
 * HTTP Context (Express)
 */
export async function createContext({
    req,
    res,
}: trpcExpress.CreateExpressContextOptions) {
    const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
    });

    // Get client IP for rate limiting
    const ip =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        "unknown";

    return {
        user: session?.user ?? null,
        session: session?.session ?? null,
        ip,
        req,
        res,
        type: "http" as const,
    };
}

/**
 * WebSocket Context
 */
export async function createWsContext({ req, res }: CreateWSSContextFnOptions) {
    // Session is usually passed via cookie or header in the upgrade request
    const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
    });

    // Fallback: If no session in cookie, check params (if needed, but cookies usually flow in WS upgrade)

    return {
        user: session?.user ?? null,
        session: session?.session ?? null,
        ip: req.socket.remoteAddress || "unknown",
        req,
        res,
        type: "ws" as const,
    };
}

export type Context =
    | inferAsyncReturnType<typeof createContext>
    | inferAsyncReturnType<typeof createWsContext>;
