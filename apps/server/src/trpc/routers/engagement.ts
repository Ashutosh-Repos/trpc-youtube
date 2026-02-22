import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { StreamService } from "../../services/StreamService";
import { TRPCError } from "@trpc/server";
import prisma from "../../lib/prisma";

/** Hybrid cache→DB read for a user's reaction on a video. */
async function getReaction(
    userId: string,
    videoId: string,
): Promise<string | null> {
    const cached = await StreamService.getUserReaction(userId, videoId);
    if (cached !== null) return cached;
    const db = await prisma.video_reactions.findUnique({
        where: { videoId_userId: { videoId, userId } },
    });
    return db?.type ?? null;
}

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

            let currentParams = await getReaction(userId, videoId);

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

            let currentParams = await getReaction(userId, videoId);

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
