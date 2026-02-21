import prisma from "../lib/prisma";
import redis from "../lib/redis";
import { Prisma } from "../../generated/prisma/client";
import { NotificationService } from "./NotificationService";

export type CommentSort = "TOP" | "NEWEST";

interface CommentItem {
    id: string;
    videoId: string;
    userId: string;
    parentId: string | null;
    content: string;
    likeCount: number;
    dislikeCount: number;
    replyCount: number;
    isEdited: boolean;
    isPinned: boolean;
    createdAt: Date;
    user: {
        id: string;
        name: string | null;
        image: string | null;
        channels: {
            handle: string;
            name: string;
            image: string | null;
            isVerified: boolean;
        }[];
    };
    userReaction?: "LIKE" | "DISLIKE" | null;
}

interface CommentListResult {
    items: CommentItem[];
    nextCursor: string | null;
}

export class CommentService {
    private static CACHE_TTL = 300; // 5 minutes for list cache
    private static FAST_LANE_TTL = 86400; // 24 hours for reaction cache

    private static KEYS = {
        list: (videoId: string, sort: string) =>
            `video:${videoId}:comments:${sort.toLowerCase()}:page1`,
        reaction: (userId: string, commentId: string) =>
            `user:comment_reaction:${userId}:${commentId}`,
        engagementStream: "queue:comment-engagement",
        countStream: "queue:comment-count",
    };

    /**
     * Get comments for a video with tiered caching.
     * - Page 1 is cached in Redis for 5 minutes.
     * - Subsequent pages hit the DB using cursor pagination.
     */
    static async getComments(
        videoId: string,
        sortBy: CommentSort = "NEWEST",
        cursor: string | null = null,
        limit: number = 20,
        userId?: string,
    ) {
        // 1. Try Cache for First Page
        const isFirstPage = !cursor;
        const cacheKey = this.KEYS.list(videoId, sortBy);

        if (isFirstPage) {
            const cached = await redis.get(cacheKey);
            if (cached) {
                try {
                    const result = JSON.parse(cached) as CommentListResult;
                    // 6. Hydrate User Reactions (Always for Logged In User)
                    let reactions: Record<string, "LIKE" | "DISLIKE"> = {};
                    if (userId) {
                        const commentIds = (
                            result.items as unknown as CommentItem[]
                        ).map((c) => c.id);
                        reactions = await this.fetchUserReactionsBatch(
                            userId,
                            commentIds,
                        );
                    }
                    // Attach reaction to each item
                    result.items = (
                        result.items as unknown as CommentItem[]
                    ).map((c) => ({
                        ...c,
                        userReaction: reactions[c.id] || null,
                    }));

                    return result;
                } catch (e) {
                    console.warn("Invalid comment cache", e);
                }
            }
        }

        // 2. Build Query
        const orderBy: Prisma.commentsOrderByWithRelationInput[] =
            sortBy === "TOP"
                ? [
                      { isPinned: "desc" },
                      { likeCount: "desc" },
                      { createdAt: "desc" },
                  ]
                : [{ isPinned: "desc" }, { createdAt: "desc" }];

        const where: Prisma.commentsWhereInput = {
            videoId,
            parentId: null, // Top-level comments only
            status: "VISIBLE",
            deletedAt: null, // Filter out soft-deleted
        };

        // 3. Execute DB Query
        const comments = await prisma.comments.findMany({
            take: limit + 1, // +1 to check for next page
            where,
            orderBy,
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                        channels: {
                            select: {
                                handle: true,
                                name: true,
                                image: true,
                                isVerified: true,
                            },
                            take: 1,
                        },
                    },
                },
            },
        });

        // 4. Transform & Pagination Logic
        let nextCursor: string | null = null;
        if (comments.length > limit) {
            const nextItem = comments.pop();
            nextCursor = nextItem?.id || null;
        }

        const result: CommentListResult = {
            items: comments as unknown as CommentItem[],
            nextCursor,
        };

        // 5. Cache First Page (Async) -> CACHE RAW ITEMS ONLY (Shared)
        if (isFirstPage) {
            await redis.set(
                cacheKey,
                JSON.stringify(result),
                "EX",
                this.CACHE_TTL,
            );
        }

        let reactions: Record<string, "LIKE" | "DISLIKE"> = {};
        if (userId) {
            const commentIds = (result.items as unknown as CommentItem[]).map(
                (c) => c.id,
            );
            reactions = await this.fetchUserReactionsBatch(userId, commentIds);
        }
        // Attach reaction to each item
        result.items = (result.items as unknown as CommentItem[]).map((c) => ({
            ...c,
            userReaction: reactions[c.id] || null,
        }));

        return result as CommentListResult;
    }

    /**
     * Get replies for a specific comment.
     * Replies are usually less hot, so we might skip caching for now or use shorter TTL.
     */
    static async getReplies(
        parentId: string,
        cursor: string | null = null,
        limit: number = 10,
        userId?: string,
    ): Promise<CommentListResult> {
        // 1. Try Cache for First Page
        const isFirstPage = !cursor;
        const cacheKey = `comment:${parentId}:replies:page1`;

        if (isFirstPage) {
            const cached = await redis.get(cacheKey);
            if (cached) {
                try {
                    const result = JSON.parse(cached) as CommentListResult;
                    // Hydrate Reactions
                    let reactions: Record<string, "LIKE" | "DISLIKE"> = {};
                    if (userId) {
                        const commentIds = (
                            result.items as unknown as CommentItem[]
                        ).map((c) => c.id);
                        reactions = await this.fetchUserReactionsBatch(
                            userId,
                            commentIds,
                        );
                    }
                    result.items = (
                        result.items as unknown as CommentItem[]
                    ).map((c) => ({
                        ...c,
                        userReaction: reactions[c.id] || null,
                    }));
                    return result;
                } catch (e) {
                    console.warn("Invalid replies cache", e);
                }
            }
        }

        const comments = await prisma.comments.findMany({
            take: limit + 1,
            where: {
                parentId,
                status: "VISIBLE",
                deletedAt: null,
            },
            orderBy: { createdAt: "asc" },
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                        channels: {
                            select: {
                                handle: true,
                                name: true,
                                image: true,
                                isVerified: true,
                            },
                            take: 1,
                        },
                    },
                },
            },
        });

        let nextCursor: string | null = null;
        if (comments.length > limit) {
            const nextItem = comments.pop();
            nextCursor = nextItem?.id || null;
        }

        const result: CommentListResult = {
            items: comments as unknown as CommentItem[],
            nextCursor,
        };

        // Cache First Page (Async) - Short TTL (e.g. 60s) as replies change fast in viral threads
        if (isFirstPage) {
            await redis.set(cacheKey, JSON.stringify(result), "EX", 60);
        }

        // Hydrate Reactions
        let reactions: Record<string, "LIKE" | "DISLIKE"> = {};
        if (userId) {
            const commentIds = (result.items as unknown as CommentItem[]).map(
                (c) => c.id,
            );
            reactions = await this.fetchUserReactionsBatch(userId, commentIds);
        }
        result.items = (result.items as unknown as CommentItem[]).map((c) => ({
            ...c,
            userReaction: reactions[c.id] || null,
        }));

        return result as CommentListResult;
    }

    /**
     * Create a new comment.
     * - Writes to DB
     * - Updates Counts (Video & Parent)
     * - Triggers Notifications
     * - Invalidates List Cache
     */
    static async createComment(
        userId: string,
        videoId: string,
        content: string,
        parentId?: string,
    ) {
        let effectiveParentId = parentId;

        if (parentId) {
            const parent = await prisma.comments.findUnique({
                where: { id: parentId },
                select: { id: true, parentId: true, deletedAt: true },
            });
            if (!parent || parent.deletedAt) {
                throw new Error("Cannot reply to a deleted comment");
            }

            // Flattening: If parent is already a reply, use ITS parent (the root)
            if (parent.parentId) {
                effectiveParentId = parent.parentId;
            }
        }

        // 1. Create Comment
        const result = await prisma.comments.create({
            data: {
                userId,
                videoId,
                content,
                parentId: effectiveParentId,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                        channels: {
                            select: {
                                handle: true,
                                name: true,
                                image: true,
                                isVerified: true,
                            },
                            take: 1,
                        },
                    },
                },
                videos: {
                    select: {
                        channelId: true,
                        title: true,
                        thumbnailUrl: true,
                        channels: {
                            select: {
                                userId: true,
                            },
                        },
                    },
                },
            },
        });

        // 2. Invalidate Caches
        await redis.del(
            this.KEYS.list(videoId, "TOP"),
            this.KEYS.list(videoId, "NEWEST"),
        );
        if (effectiveParentId) {
            await redis.del(`comment:${effectiveParentId}:replies:page1`);
        }

        // 3. Trigger Notifications (Async)
        this.handleNotifications(result, userId).catch((err) => {
            console.error("Failed to send comment notifications", err);
        });

        // 4. Queue Comment Count Update (Fire & Forget)
        const pipeline = redis.pipeline();
        // Video Count
        pipeline.xadd(
            this.KEYS.countStream,
            "*",
            "type",
            "video",
            "entityId",
            videoId,
            "delta",
            "1",
        );
        // Reply Count (if reply)
        if (effectiveParentId) {
            pipeline.xadd(
                this.KEYS.countStream,
                "*",
                "type",
                "comment",
                "entityId",
                effectiveParentId,
                "delta",
                "1",
            );
        }
        pipeline.exec().catch((err) => {
            console.error("Failed to queue comment count increments", err);
        });

        return result;
    }

    private static async handleNotifications(
        comment: Prisma.commentsGetPayload<{
            include: {
                videos: {
                    select: {
                        channelId: true;
                        title: true;
                        thumbnailUrl: true;
                        channels: {
                            select: {
                                userId: true;
                            };
                        };
                    };
                };
            };
        }>,
        actorId: string,
    ) {
        // A. Video Owner Notification
        const videoOwnerId = comment.videos.channels.userId;
        // Don't notify if commenting on own video
        if (videoOwnerId !== actorId) {
            const truncated =
                comment.content.length > 50
                    ? comment.content.substring(0, 50) + "..."
                    : comment.content;
            await NotificationService.notify({
                userId: videoOwnerId,
                actorId: actorId,
                type: "COMMENT",
                title: "New Comment",
                message: `commented: "${truncated}"`,
                videoId: comment.videoId,
                commentId: comment.id,
                thumbnailUrl: comment.videos.thumbnailUrl || undefined,
                actionUrl: `/watch/${comment.videoId}?lc=${comment.id}`,
            });
        }

        // B. Reply Notification
        if (comment.parentId) {
            const parent = await prisma.comments.findUnique({
                where: { id: comment.parentId },
                select: { userId: true },
            });

            if (
                parent &&
                parent.userId !== actorId &&
                parent.userId !== videoOwnerId
            ) {
                const truncatedReply =
                    comment.content.length > 50
                        ? comment.content.substring(0, 50) + "..."
                        : comment.content;
                await NotificationService.notify({
                    userId: parent.userId,
                    actorId: actorId,
                    type: "COMMENT_REPLY",
                    title: "New Reply",
                    message: `replied: "${truncatedReply}"`,
                    videoId: comment.videoId,
                    commentId: comment.id,
                    thumbnailUrl: comment.videos.thumbnailUrl || undefined,
                    actionUrl: `/watch/${comment.videoId}?lc=${comment.id}`,
                });
            }
        }
    }

    /**
     * Soft delete a comment.
     * - Sets deletedAt
     * - Decrements Counts
     * - Invalidates Cache
     */
    static async deleteComment(commentId: string, userId: string) {
        const comment = await prisma.comments.findUnique({
            where: { id: commentId },
            select: {
                userId: true,
                videoId: true,
                parentId: true,
                deletedAt: true,
            },
        });

        if (!comment) throw new Error("Comment not found");
        if (comment.userId !== userId) throw new Error("Unauthorized");
        if (comment.deletedAt) throw new Error("Comment already deleted"); // Idempotency check

        // Soft Delete
        await prisma.comments.update({
            where: { id: commentId },
            data: { deletedAt: new Date() },
        });

        // Invalidate Cache
        await redis.del(
            this.KEYS.list(comment.videoId, "TOP"),
            this.KEYS.list(comment.videoId, "NEWEST"),
        );

        // Queue Comment Count Decrement
        // Queue Comment Count Decrement
        const pipeline = redis.pipeline();
        pipeline.xadd(
            this.KEYS.countStream,
            "*",
            "type",
            "video",
            "entityId",
            comment.videoId,
            "delta",
            "-1",
        );
        if (comment.parentId) {
            pipeline.xadd(
                this.KEYS.countStream,
                "*",
                "type",
                "comment",
                "entityId",
                comment.parentId,
                "delta",
                "-1",
            );
        }
        pipeline.exec().catch((err) => {
            console.error("Failed to queue comment count decrements", err);
        });

        return { success: true };
    }

    /**
     * Add a reaction (Like/Dislike) to a comment.
     * High-scale implementation using Write-Behind pattern.
     */
    static async addReaction(
        userId: string,
        commentId: string,
        type: "LIKE" | "DISLIKE" | "REMOVE",
        videoId: string, // Needed for some cache keys potentially, but mostly commentId is enough
    ) {
        const reactionKey = this.KEYS.reaction(userId, commentId);
        const timestamp = Date.now();

        const pipeline = redis.pipeline();

        // 1. Update User Cache (Read-Your-Own-Write)
        if (type === "REMOVE") {
            pipeline.set(reactionKey, "REMOVE", "EX", this.FAST_LANE_TTL);
        } else {
            pipeline.set(reactionKey, type, "EX", this.FAST_LANE_TTL);
        }

        // 2. Push to Stream for worker
        pipeline.xadd(
            this.KEYS.engagementStream,
            "MAXLEN",
            "~",
            1000000,
            "*",
            "data",
            JSON.stringify({
                userId,
                commentId,
                videoId,
                type,
                timestamp,
            }),
        );

        await pipeline.exec();
    }

    /**
     * Get user's current reaction for a comment.
     * Hybrid Read: Cache || DB
     */
    static async getUserReaction(userId: string, commentId: string) {
        try {
            const reactionKey = this.KEYS.reaction(userId, commentId);
            const cached = await redis.get(reactionKey);
            if (cached) return cached as "LIKE" | "DISLIKE" | "REMOVE";

            // Fallback to DB
            const dbReaction = await prisma.comment_reactions.findUnique({
                where: { commentId_userId: { commentId, userId } },
            });
            return dbReaction?.type || null;
        } catch (e) {
            return null;
        }
    }

    /**
     * Batch fetch user reactions for a list of comment IDs.
     * Uses Pipeline/MGET for cache and single DB query for misses.
     */
    private static async fetchUserReactionsBatch(
        userId: string,
        commentIds: string[],
    ): Promise<Record<string, "LIKE" | "DISLIKE">> {
        if (commentIds.length === 0) return {};

        const keys = commentIds.map((id) => this.KEYS.reaction(userId, id));
        const reactionMap: Record<string, "LIKE" | "DISLIKE"> = {};
        const missingIds: string[] = [];

        try {
            // 1. Try Cache (MGET)
            const cachedValues = await redis.mget(keys);

            cachedValues.forEach((val, idx) => {
                if (val) {
                    if (val !== "REMOVE") {
                        reactionMap[commentIds[idx]] = val as
                            | "LIKE"
                            | "DISLIKE";
                    }
                } else {
                    missingIds.push(commentIds[idx]);
                }
            });

            // 2. Fetch Missing from DB
            if (missingIds.length > 0) {
                const dbReactions = await prisma.comment_reactions.findMany({
                    where: {
                        userId,
                        commentId: { in: missingIds },
                    },
                    select: { commentId: true, type: true },
                });

                dbReactions.forEach((r) => {
                    reactionMap[r.commentId] = r.type;
                });
            }
        } catch (e) {
            console.error("Failed to batch fetch reactions", e);
        }

        return reactionMap;
    }

    /**
     * Get a single comment by ID, fully hydrated with user and reaction state.
     * Used for highlighting specific linked comments (e.g. from notifications).
     */
    static async getById(commentId: string, userId?: string) {
        const comment = await prisma.comments.findUnique({
            where: { id: commentId, status: "VISIBLE", deletedAt: null },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                        channels: {
                            select: {
                                handle: true,
                                name: true,
                                image: true,
                                isVerified: true,
                            },
                            take: 1,
                        },
                    },
                },
            },
        });

        if (!comment) return null;

        let userReaction = null;
        if (userId) {
            userReaction = await this.getUserReaction(userId, commentId);
        }

        return {
            ...comment,
            userReaction,
        } as unknown as CommentItem;
    }
}
