import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { StreamService } from "../../services/StreamService";
import { TRPCError } from "@trpc/server";
import prisma from "../../lib/prisma";

export const engagementRouter = router({
    /**
     * Toggle Like on a video.
     * If already liked, removes like.
     * If disliked, changes to like.
     */
    toggleLike: protectedProcedure
        .input(z.object({ videoId: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.user.id;
            const { videoId } = input;

            // 1. Check current state (Hybrid Read: Cache + DB)
            // Ideally we trust the frontend state, but valid to check cache for "truth".
            // Actually, for toggle logic, we need to know current state.
            // "Blind Toggle" is risky if UI is out of sync.
            // Better: 'setLike', 'setDislike', 'removeReaction' explicit actions?
            // "Toggle" is standard for UI buttons.

            // Let's fetch current state from Cache (Fastest) -> Fallback DB
            let currentParams = await StreamService.getUserReaction(
                userId,
                videoId,
            );

            if (currentParams === null) {
                // Fallback to DB
                const dbReaction = await prisma.video_reactions.findUnique({
                    where: { videoId_userId: { videoId, userId } },
                });
                currentParams = dbReaction?.type || null;
            }

            let action: "LIKE" | "REMOVE" | "DISLIKE" = "LIKE";

            if (currentParams === "LIKE") {
                action = "REMOVE";
            } else {
                action = "LIKE";
            }

            await StreamService.addReaction(userId, videoId, action);

            return { status: action };
        }),

    /**
     * Toggle Dislike on a video.
     */
    toggleDislike: protectedProcedure
        .input(z.object({ videoId: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.user.id;
            const { videoId } = input;

            let currentParams = await StreamService.getUserReaction(
                userId,
                videoId,
            );

            if (currentParams === null) {
                const dbReaction = await prisma.video_reactions.findUnique({
                    where: { videoId_userId: { videoId, userId } },
                });
                currentParams = dbReaction?.type || null;
            }

            let action: "DISLIKE" | "REMOVE" | "LIKE" = "DISLIKE";

            if (currentParams === "DISLIKE") {
                action = "REMOVE";
            } else {
                action = "DISLIKE";
            }

            await StreamService.addReaction(userId, videoId, action);

            return { status: action };
        }),
});
