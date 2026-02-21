import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../trpc";
import { CommentService, CommentSort } from "../../services/CommentService";
import { TRPCError } from "@trpc/server";
import prisma from "../../lib/prisma";

export const commentRouter = router({
    list: publicProcedure
        .input(
            z.object({
                videoId: z.string(),
                sortBy: z.enum(["TOP", "NEWEST"]).optional().default("NEWEST"),
                cursor: z.string().nullish(),
                limit: z.number().min(1).max(50).optional().default(20),
            }),
        )
        .query(async ({ input, ctx }) => {
            const { videoId, sortBy, cursor, limit } = input;
            const userId = ctx.user?.id;

            return CommentService.getComments(
                videoId,
                sortBy as CommentSort,
                cursor,
                limit,
                userId,
            );
        }),

    getById: publicProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input, ctx }) => {
            const comment = await CommentService.getById(
                input.id,
                ctx.user?.id,
            );
            if (!comment) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Comment not found or deleted",
                });
            }
            return comment;
        }),

    replies: publicProcedure
        .input(
            z.object({
                parentId: z.string(),
                cursor: z.string().nullish(),
                limit: z.number().min(1).max(50).optional().default(10),
            }),
        )
        .query(async ({ input, ctx }) => {
            const { parentId, cursor, limit } = input;
            const userId = ctx.user?.id;
            return CommentService.getReplies(parentId, cursor, limit, userId);
        }),

    create: protectedProcedure
        .input(
            z.object({
                videoId: z.string(),
                content: z.string().min(1).max(2000), // Reasonable limit
                parentId: z.string().optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { videoId, content, parentId } = input;
            const comment = await CommentService.createComment(
                ctx.user.id,
                videoId,
                content,
                parentId,
            );
            return comment;
        }),

    toggleLike: protectedProcedure
        .input(z.object({ commentId: z.string(), videoId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.user.id;
            const { commentId, videoId } = input;

            const comment = await prisma.comments.findUnique({
                where: { id: commentId },
                select: { videoId: true },
            });

            if (!comment || comment.videoId !== videoId) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message:
                        "Comment not found or does not belong to this video",
                });
            }

            // Check current state (Hybrid Read)
            let current = await CommentService.getUserReaction(
                userId,
                commentId,
            );

            let action: "LIKE" | "REMOVE" | "DISLIKE" = "LIKE";
            if (current === "LIKE") {
                action = "REMOVE";
            } else {
                action = "LIKE"; // Overwrites DISLIKE if exists
            }

            await CommentService.addReaction(
                userId,
                commentId,
                action,
                videoId,
            );
            return { status: action };
        }),

    toggleDislike: protectedProcedure
        .input(z.object({ commentId: z.string(), videoId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.user.id;
            const { commentId, videoId } = input;

            const comment = await prisma.comments.findUnique({
                where: { id: commentId },
                select: { videoId: true },
            });

            if (!comment || comment.videoId !== videoId) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message:
                        "Comment not found or does not belong to this video",
                });
            }

            let current = await CommentService.getUserReaction(
                userId,
                commentId,
            );

            let action: "DISLIKE" | "REMOVE" | "LIKE" = "DISLIKE";
            if (current === "DISLIKE") {
                action = "REMOVE";
            } else {
                action = "DISLIKE";
            }

            await CommentService.addReaction(
                userId,
                commentId,
                action,
                videoId,
            );
            return { status: action };
        }),

    delete: protectedProcedure
        .input(z.object({ commentId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            return CommentService.deleteComment(input.commentId, ctx.user.id);
        }),
});
