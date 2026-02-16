"use server";

import prisma from "@/lib/prisma";
import { getSessionUser } from "./user";
import { ActionResponse, createErrorResponse } from "./schema-types";
import { revalidatePath } from "next/cache";
import { v4 as uuidv4 } from "uuid";
import redis from "@/lib/redis";
/**
 * Add a new comment or reply
 */
export async function addComment(
    videoId: string,
    content: string,
    parentId?: string,
): Promise<ActionResponse<{ id: string }>> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return createErrorResponse("UNAUTHORIZED", "Login required", 401);
        }

        if (!content || content.trim().length === 0) {
            return createErrorResponse(
                "INVALID_INPUT",
                "Comment cannot be empty",
            );
        }

        const comment = await prisma.$transaction(async (tx) => {
            // 1. Create Comment
            const newComment = await tx.comment.create({
                data: {
                    id: uuidv4(),
                    videoId,
                    userId: user.id,
                    content: content.trim(),
                    parentId: parentId || null,
                },
            });

            // 2. Increment Counts
            if (parentId) {
                // Increment replyCount on parent
                await tx.comment.update({
                    where: { id: parentId },
                    data: { replyCount: { increment: 1 } },
                });
            } else {
                // Increment commentCount on video
                await tx.video.update({
                    where: { id: videoId },
                    data: { commentCount: { increment: 1 } },
                });
            }

            return newComment;
        });

        // 3. Trigger Notification (Async)
        // Only if it's a reply (notify original commenter) or top-level (notify video owner)
        try {
            let targetUserId: string | undefined;

            if (parentId) {
                // Fetch parent comment to get author
                const parentComment = await prisma.comment.findUnique({
                    where: { id: parentId },
                    select: { userId: true },
                });
                if (parentComment && parentComment.userId !== user.id) {
                    targetUserId = parentComment.userId;
                }
            } else {
                // Fetch video owner
                const video = await prisma.video.findUnique({
                    where: { id: videoId },
                    select: {
                        channel: { select: { userId: true } },
                    },
                });
                if (video && video.channel.userId !== user.id) {
                    targetUserId = video.channel.userId;
                }
            }

            if (targetUserId) {
                await redis.xadd(
                    "queue:notifications",
                    "*",
                    "type",
                    "COMMENT",
                    "actorId",
                    user.id,
                    "targetId",
                    targetUserId,
                    "videoId",
                    videoId,
                    "commentId",
                    comment.id,
                );
            }
        } catch (err) {
            console.error("[Comment] Notification trigger failed:", err);
        }

        // Optional: Revalidate path
        revalidatePath(`/watch/${videoId}`);

        return { success: true, data: { id: comment.id } };
    } catch (error) {
        console.error("[Comment] Add failed:", error);
        return createErrorResponse("INTERNAL_ERROR", "Failed to post comment");
    }
}

/**
 * Get comments for a video (pagination)
 */
export async function getComments(
    videoId: string,
    cursor?: string,
    limit: number = 20,
) {
    try {
        const comments = await prisma.comment.findMany({
            where: {
                videoId,
                parentId: null, // Only root comments
                status: "VISIBLE",
            },
            take: limit + 1, // Fetch one extra to determine if there's a next page
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            orderBy: {
                createdAt: "desc",
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                    },
                },
            },
        });

        let nextCursor: string | undefined = undefined;
        if (comments.length > limit) {
            const nextItem = comments.pop();
            nextCursor = nextItem!.id;
        }

        return {
            success: true,
            data: {
                comments,
                nextCursor,
            },
        };
    } catch (error) {
        console.error("[Comment] Get failed:", error);
        return createErrorResponse("INTERNAL_ERROR", "Failed to load comments");
    }
}

/**
 * Get replies for a specific comment
 */
export async function getReplies(parentId: string) {
    try {
        const replies = await prisma.comment.findMany({
            where: {
                parentId,
                status: "VISIBLE",
            },
            orderBy: {
                createdAt: "asc", // Replies usually chronological
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                    },
                },
            },
        });

        return { success: true, data: replies };
    } catch (error) {
        console.error("[Comment] Get replies failed:", error);
        return createErrorResponse("INTERNAL_ERROR", "Failed to load replies");
    }
}
