import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import prisma from "../../lib/prisma";
import { StreamService } from "../../services/StreamService";
import { HistoryService } from "../../services/HistoryService";
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

            return await HistoryService.getHistory(userId, limit, cursor);
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
            await HistoryService.invalidateUserCache(userId);

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
        await HistoryService.invalidateUserCache(userId);

        return { success: true };
    }),
});
