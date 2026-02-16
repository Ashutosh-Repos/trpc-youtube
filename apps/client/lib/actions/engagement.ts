"use server";

import redis from "@/lib/redis";
import prisma from "@/lib/prisma";
import { getSessionUser } from "./user";
import { ActionResponse, createErrorResponse } from "./schema-types";
import { ReactionType } from "@/app/generated/prisma/client";
import { revalidatePath } from "next/cache";

/**
 * Toggle a reaction (LIKE/DISLIKE) on a video using Atomic Lua Scripts
 */
export async function toggleVideoReaction(
    videoId: string,
    type: ReactionType,
): Promise<ActionResponse<{ added: boolean; type: ReactionType }>> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return createErrorResponse("UNAUTHORIZED", "Login required", 401);
        }

        const userId = user.id;
        const likeKey = `video:${videoId}:likes`;
        const dislikeKey = `video:${videoId}:dislikes`;
        const metricsKey = `video:${videoId}:metrics`;
        const userLikesKey = `user:${userId}:likes`; // Set of videoIds liked by user
        const userDislikesKey = `user:${userId}:dislikes`; // Set of videoIds disliked by user

        // Lua Script for Atomic Toggle
        // Keys: [1] targetSet, [2] otherSet, [3] metricsKey, [4] userTargetSet, [5] userOtherSet
        // Args: [1] userId, [2] videoId, [3] valid 'like' or 'dislike' string for metrics hash field
        const script = `
            local userId = ARGV[1]
            local videoId = ARGV[2]
            local metricField = ARGV[3]
            local otherMetricField = ARGV[4]

            -- Check if already exists in target set
            local exists = redis.call('SISMEMBER', KEYS[1], userId)
            
            if exists == 1 then
                -- REMOVE REACTION
                redis.call('SREM', KEYS[1], userId)
                redis.call('HINCRBY', KEYS[3], metricField, -1)
                
                -- Remove from user specific Sets for fast lookup
                redis.call('SREM', KEYS[4], videoId)
                
                return {0, 'removed'} -- 0 = removed
            else
                -- ADD REACTION (and remove opposite if exists)
                
                -- Check/Remove from opposite set
                local otherExists = redis.call('SISMEMBER', KEYS[2], userId)
                if otherExists == 1 then
                    redis.call('SREM', KEYS[2], userId)
                    redis.call('HINCRBY', KEYS[3], otherMetricField, -1)
                    redis.call('SREM', KEYS[5], videoId)
                end

                -- Add to target set
                redis.call('SADD', KEYS[1], userId)
                redis.call('HINCRBY', KEYS[3], metricField, 1)
                redis.call('SADD', KEYS[4], videoId)

                return {1, 'added'} -- 1 = added
            end
        `;

        const metricField = type === "LIKE" ? "likeCount" : "dislikeCount";
        const otherMetricField = type === "LIKE" ? "dislikeCount" : "likeCount";

        const result = (await redis.eval(
            script,
            5,
            type === "LIKE" ? likeKey : dislikeKey,
            type === "LIKE" ? dislikeKey : likeKey,
            metricsKey,
            type === "LIKE" ? userLikesKey : userDislikesKey,
            type === "LIKE" ? userDislikesKey : userLikesKey,
            userId,
            videoId,
            metricField,
            otherMetricField,
        )) as [number, string];

        const [status] = result;
        const added = status === 1;

        // Push to persistence queue (Fire and Forget)
        // We push a 'snapshot' event or a delta.
        // For verifyable consistency, we push the INTENT.
        await redis.xadd(
            "queue:engagement",
            "*",
            "type",
            "REACTION",
            "action",
            added ? "ADD" : "REMOVE",
            "reactionType",
            type,
            "userId",
            userId,
            "videoId",
            videoId,
            "timestamp",
            Date.now().toString(),
        );

        // Optional: Revalidate if we want SSR pages to update,
        // strictly mostly client-side optimistic though.
        // revalidatePath(`/watch/${videoId}`); // Can be expensive on high frequency

        return { success: true, data: { added, type } };
    } catch (error) {
        console.error("[Engagement] Toggle failed:", error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to update reaction",
        );
    }
}

/**
 * Register a view with enhanced tracking for trending and personalization
 */
export async function registerView(
    videoId: string,
    options?: {
        userId?: string;
        watchedSeconds?: number;
        duration?: number;
        isUniqueView?: boolean;
    },
): Promise<ActionResponse<{ views: number }>> {
    try {
        const metricsKey = `video:${videoId}:metrics`;

        // Only increment view count for unique views (prevents inflation)
        let newCount = 0;
        if (options?.isUniqueView !== false) {
            newCount = await redis.hincrby(metricsKey, "viewCount", 1);

            // Track hourly bucket for trending score calculation (48h TTL)
            const hourBucket = Math.floor(Date.now() / 3600000);
            const hourlyKey = `video:${videoId}:views:hourly:${hourBucket}`;
            await redis.hincrby(hourlyKey, "count", 1);
            await redis.expire(hourlyKey, 172800); // 48 hours
        }

        // Always push to persistence queue for watch history tracking
        await redis.xadd(
            "queue:engagement",
            "*",
            "type",
            "VIEW",
            "videoId",
            videoId,
            "userId",
            options?.userId || "",
            "watchedSeconds",
            (options?.watchedSeconds || 0).toString(),
            "duration",
            (options?.duration || 0).toString(),
            "timestamp",
            Date.now().toString(),
        );

        return { success: true, data: { views: newCount } };
    } catch (error) {
        console.error("[Engagement] View register failed:", error);
        // Fail silently for views, don't block UI
        return { success: true, data: { views: 0 } };
    }
}

/**
 * Update watch progress for authenticated users (subsequent pulses)
 * This is called when user continues watching after initial view registration
 */
export async function updateWatchProgress(
    videoId: string,
    userId: string,
    options: {
        watchedSeconds: number;
        duration: number;
    },
): Promise<void> {
    try {
        // Push to persistence queue for watch history update
        await redis.xadd(
            "queue:engagement",
            "*",
            "type",
            "PROGRESS_UPDATE",
            "videoId",
            videoId,
            "userId",
            userId,
            "watchedSeconds",
            options.watchedSeconds.toString(),
            "duration",
            options.duration.toString(),
            "timestamp",
            Date.now().toString(),
        );
    } catch (error) {
        console.error("[Engagement] Watch progress update failed:", error);
        // Fail silently, don't block UI
    }
}

/**
 * Get current metrics (Hybrid: Redis -> DB Fallback)
 */
export async function getVideoMetrics(videoId: string) {
    try {
        const metricsKey = `video:${videoId}:metrics`;
        const metrics = await redis.hgetall(metricsKey);

        if (metrics && Object.keys(metrics).length > 0) {
            return {
                likes: parseInt(metrics.likeCount || "0"),
                dislikes: parseInt(metrics.dislikeCount || "0"),
                views: parseInt(metrics.viewCount || "0"),
            };
        }

        // Fallback to DB
        const video = await prisma.video.findUnique({
            where: { id: videoId },
            select: {
                viewCount: true,
                likeCount: true,
                dislikeCount: true,
            },
        });

        if (!video) return { likes: 0, dislikes: 0, views: 0 };

        // Warm up Redis Cache (Optional but recommended)
        await redis.hset(metricsKey, {
            viewCount: video.viewCount.toString(),
            likeCount: video.likeCount.toString(),
            dislikeCount: video.dislikeCount.toString(),
        });
        await redis.expire(metricsKey, 86400); // 24h

        return {
            likes: video.likeCount,
            dislikes: video.dislikeCount,
            views: video.viewCount,
        };
    } catch (error) {
        console.error("[Engagement] Metrics fetch error:", error);
        return { likes: 0, dislikes: 0, views: 0 };
    }
}

/**
 * Get user's reaction state
 */
export async function getUserReaction(videoId: string) {
    const user = await getSessionUser();
    if (!user) return null;

    const likeKey = `video:${videoId}:likes`;
    const dislikeKey = `video:${videoId}:dislikes`;

    // Pipeline for speed
    const [isLiked, isDisliked] = await Promise.all([
        redis.sismember(likeKey, user.id),
        redis.sismember(dislikeKey, user.id),
    ]);

    if (isLiked) return "LIKE";
    if (isDisliked) return "DISLIKE";
    return null;
}
/**
 * Get full engagement state for a video (combined for UI efficiency)
 */
export async function getVideoEngagementState(videoId: string) {
    const [metrics, userReaction] = await Promise.all([
        getVideoMetrics(videoId),
        getUserReaction(videoId),
    ]);

    return {
        ...metrics,
        userReaction,
    };
}

/**
 * Toggle reaction on a comment (Atomic via Postgres for simplicity, or Redis for scale)
 */
export async function toggleCommentReaction(
    commentId: string,
    type: ReactionType,
): Promise<ActionResponse<string>> {
    const user = await getSessionUser();
    if (!user)
        return createErrorResponse("UNAUTHORIZED", "Login to react", 401);

    try {
        const res = await prisma.$transaction(async (tx) => {
            const existing = await tx.commentReaction.findUnique({
                where: { commentId_userId: { commentId, userId: user.id } },
            });

            if (existing) {
                if (existing.type === type) {
                    await tx.commentReaction.delete({
                        where: { id: existing.id },
                    });
                    await tx.comment.update({
                        where: { id: commentId },
                        data: {
                            [type === "LIKE" ? "likeCount" : "dislikeCount"]: {
                                decrement: 1,
                            },
                        },
                    });
                    return "REMOVED";
                } else {
                    await tx.commentReaction.update({
                        where: { id: existing.id },
                        data: { type },
                    });
                    await tx.comment.update({
                        where: { id: commentId },
                        data: {
                            [type === "LIKE" ? "likeCount" : "dislikeCount"]: {
                                increment: 1,
                            },
                            [type === "LIKE" ? "dislikeCount" : "likeCount"]: {
                                decrement: 1,
                            },
                        },
                    });
                    return "SWITCHED";
                }
            } else {
                await tx.commentReaction.create({
                    data: { commentId, userId: user.id, type },
                });
                await tx.comment.update({
                    where: { id: commentId },
                    data: {
                        [type === "LIKE" ? "likeCount" : "dislikeCount"]: {
                            increment: 1,
                        },
                    },
                });
                return "ADDED";
            }
        });

        return { success: true, data: res };
    } catch (error) {
        return createErrorResponse("SERVER_ERROR", "Failed to react");
    }
}
