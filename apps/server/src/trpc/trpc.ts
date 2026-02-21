import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { Context } from "./context";
import { rateLimit } from "../lib/rate-limit";

const t = initTRPC.context<Context>().create({
    transformer: superjson,
    errorFormatter({ shape, error }) {
        return {
            ...shape,
            data: {
                ...shape.data,
                // Hide internal errors in production
                stack:
                    process.env.NODE_ENV === "production"
                        ? undefined
                        : error.stack,
            },
        };
    },
});

export const router = t.router;

/**
 * Rate limit middleware - applies to all procedures using this
 */
const rateLimitMiddleware = t.middleware(async ({ ctx, next, path }) => {
    const isUploadEndpoint =
        path === "video.getPartUrls" || path === "video.completeUpload";

    // Default 60 req/min, 600 req/min for multipart upload endpoints
    const limit = isUploadEndpoint ? 600 : 60;

    const result = await rateLimit(ctx.ip, `trpc:${path}`, limit, 60);

    if (!result.success) {
        throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Rate limit exceeded. Try again in ${Math.ceil((result.reset - Date.now()) / 1000)}s`,
        });
    }

    return next();
});

export const cache = (seconds: number) =>
    t.middleware(({ ctx, next }) => {
        if (ctx.type === "http" && ctx.res) {
            const duration = seconds;
            ctx.res.setHeader(
                "Cache-Control",
                `public, max-age=${duration}, s-maxage=${duration}, stale-while-revalidate=${Math.floor(duration / 2)}`,
            );
        }
        return next();
    });

/**
 * Public procedure with rate limiting
 */
export const publicProcedure = t.procedure.use(rateLimitMiddleware);

/**
 * Protected procedure - requires authentication + rate limiting
 * Throws UNAUTHORIZED error if no user in context
 */
export const protectedProcedure = t.procedure
    .use(rateLimitMiddleware)
    .use(async ({ ctx, next }) => {
        if (!ctx.user) {
            throw new TRPCError({
                code: "UNAUTHORIZED",
                message: "You must be logged in to access this resource",
            });
        }

        return next({
            ctx: {
                ...ctx,
                user: ctx.user,
                session: ctx.session!,
            },
        });
    });

// ... imports

import { z } from "zod";
import prisma from "../lib/prisma";

// ... existing code

/**
 * Channel Owner Procedure
 * Enforces that the user owns the channel specified by `channelId`.
 * Adds `channel` to the context.
 */
export const channelOwnerProcedure = protectedProcedure
    .input(z.object({ channelId: z.string() }))
    .use(async ({ ctx, next, input }) => {
        const channel = await prisma.channels.findUnique({
            where: { id: input.channelId },
        });

        if (!channel) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "Channel not found",
            });
        }

        if (channel.userId !== ctx.user.id) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "You do not have permission to manage this channel",
            });
        }

        return next({
            ctx: {
                ...ctx,
                channel,
            },
        });
    });

/**
 * Video Owner Procedure
 * Enforces that the user owns the video specified by `videoId`.
 * Adds `video` to the context.
 */
export const videoOwnerProcedure = protectedProcedure
    .input(z.object({ videoId: z.string() }))
    .use(async ({ ctx, next, input }) => {
        const video = await prisma.videos.findUnique({
            where: { id: input.videoId },
            include: { channels: true }, // Needed to check channel ownership
        });

        if (!video) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "Video not found",
            });
        }

        if (video.channels.userId !== ctx.user.id) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "You do not have permission to manage this video",
            });
        }

        return next({
            ctx: {
                ...ctx,
                video,
            },
        });
    });

/**
 * Playlist Owner Procedure
 * Enforces that the user owns the playlist specified by `playlistId`.
 * Adds `playlist` to the context.
 */
export const playlistOwnerProcedure = protectedProcedure
    .input(z.object({ playlistId: z.string() }))
    .use(async ({ ctx, next, input }) => {
        const playlist = await prisma.playlists.findUnique({
            where: { id: input.playlistId },
        });

        if (!playlist) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "Playlist not found",
            });
        }

        if (playlist.userId !== ctx.user.id) {
            throw new TRPCError({
                code: "FORBIDDEN",
                message: "You do not have permission to manage this playlist",
            });
        }

        return next({
            ctx: {
                ...ctx,
                playlist,
            },
        });
    });

export const middleware = t.middleware;
