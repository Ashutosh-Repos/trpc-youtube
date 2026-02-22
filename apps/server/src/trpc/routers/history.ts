import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import prisma from "../../lib/prisma";
import { StreamService } from "../../services/StreamService";
import { ProcessingStatus } from "../../../generated/prisma/client";

export const historyRouter = router({
    /**
     * Get watch history with infinite scrolling.
     * Filters out private, deleted, or unprocessed videos.
     */
    getHistory: protectedProcedure
        .input(
            z.object({
                limit: z.number().min(1).max(100).default(20),
                cursor: z.string().optional(), // ID of the last item
            }),
        )
        .query(async ({ ctx, input }) => {
            const { limit, cursor } = input;
            const userId = ctx.user.id;

            const items = await prisma.watch_history.findMany({
                take: limit + 1,
                where: {
                    userId,
                    videos: {
                        visibility: { in: ["PUBLIC", "UNLISTED"] },
                        deletedAt: null,
                        processingStatus: ProcessingStatus.READY,
                    },
                },
                cursor: cursor ? { id: cursor } : undefined,
                orderBy: [
                    { lastWatchedAt: "desc" },
                    { id: "desc" }, // Stable tie-breaker
                ],
                include: {
                    videos: {
                        select: {
                            id: true,
                            title: true,
                            thumbnailUrl: true,
                            description: true,
                            viewCount: true,
                            createdAt: true,
                            duration: true,
                            isShort: true,
                            channels: {
                                select: {
                                    id: true,
                                    name: true,
                                    handle: true,
                                    image: true,
                                },
                            },
                        },
                    },
                },
            });

            let nextCursor: typeof cursor | undefined = undefined;
            if (items.length > limit) {
                const nextItem = items.pop();
                nextCursor = nextItem!.id;
            }

            return {
                items,
                nextCursor,
            };
        }),

    /**
     * Remove a single video from watch history.
     */
    removeFromHistory: protectedProcedure
        .input(z.object({ videoId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const { videoId } = input;
            const userId = ctx.user.id;

            // Delete from DB
            await prisma.watch_history.deleteMany({
                where: {
                    userId,
                    videoId,
                },
            });

            // Invalidate Cache
            await StreamService.clearSession(userId, videoId);

            return { success: true };
        }),

    /**
     * Clear all watch history for the user.
     */
    clearHistory: protectedProcedure.mutation(async ({ ctx }) => {
        const userId = ctx.user.id;

        // Delete all from DB
        await prisma.watch_history.deleteMany({
            where: { userId },
        });

        // Invalidate All Cache
        await StreamService.clearAllSessions(userId);

        return { success: true };
    }),
});
