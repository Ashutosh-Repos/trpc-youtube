import redis from "../lib/redis";
import { prisma } from "../lib/prisma"; // Assuming lib/prisma exports prisma instance
import os from "os";
import cluster from "cluster";
import { redisPub } from "../lib/ws/definitions";
import { NotificationService } from "../services/NotificationService";
import { HistoryService } from "../services/HistoryService";

const KEYS = {
    HISTORY_STREAM: "queue:history",
    ENGAGEMENT_STREAM: "queue:engagement",
    VIDEO_VIEW_BUFFER: "video:v:buf",
    VIDEO_VIEW_DIRTY: "video:v:dirty",
    LOCK_VIEW_WORKER: "lock:view-worker",
    LOCK_ENGAGEMENT_WORKER: "lock:engagement-worker",
    LOCK_HISTORY_WORKER: "lock:history-worker",
    COMMENT_ENGAGEMENT_STREAM: "queue:comment-engagement",
    COMMENT_COUNT_STREAM: "queue:comment-count",
    NOTIFICATION_STREAM: "queue:notifications",
    NEW_VIDEO_STREAM: "queue:new-video-notifications",
};

const GROUP_NAME = "history_workers";
// STABLE CONSUMER NAME per cluster worker for safe recovery without collision
const workerId = cluster.isWorker
    ? cluster.worker?.id
    : process.env.pm_id || "master";
const CONSUMER_NAME = `worker:${os.hostname() || "local"}:${workerId}`;

/**
 * 1. View Flush Worker (Fast Lane)
 * Flushes Redis Buffer to Postgres via Batch Update
 */
async function processViews() {
    // Leader Election (Simple)
    const locked = await redis.set(KEYS.LOCK_VIEW_WORKER, "1", "EX", 15, "NX");
    if (!locked) return; // Not leader, skip

    try {
        // 1. Get Dirty Video IDs
        const dirtyIds = await redis.smembers(KEYS.VIDEO_VIEW_DIRTY);
        if (dirtyIds.length === 0) return;

        // 2. Atomic Get & Delete via Lua
        const script = `
      local counts = {}
      for i, key in ipairs(KEYS) do
        local val = redis.call('HGET', ARGV[1], key)
        if val then
          table.insert(counts, key)
          table.insert(counts, val)
          redis.call('HDEL', ARGV[1], key)
          redis.call('SREM', ARGV[2], key) -- Remove only processed key from dirty set
        else
            redis.call('SREM', ARGV[2], key)
        end
      end
      return counts
    `;

        const CHUNK_SIZE = 1000;
        for (let i = 0; i < dirtyIds.length; i += CHUNK_SIZE) {
            const chunk = dirtyIds.slice(i, i + CHUNK_SIZE);
            const result = (await redis.eval(
                script,
                chunk.length,
                ...chunk,
                KEYS.VIDEO_VIEW_BUFFER,
                KEYS.VIDEO_VIEW_DIRTY,
            )) as string[];

            if (!result || result.length === 0) continue;

            // Result is [id, count, id, count...]
            const updates: { id: string; count: number }[] = [];
            for (let j = 0; j < result.length; j += 2) {
                const id = result[j];
                const count = parseInt(result[j + 1]);
                if (/^[a-zA-Z0-9_-]+$/.test(id)) {
                    updates.push({ id, count });
                }
            }

            // HARDENING: Sort by ID to prevent Deadlocks
            updates.sort((a, b) => a.id.localeCompare(b.id));

            // 3. Batch Update DB
            if (updates.length > 0) {
                const cases = updates
                    .map(
                        (u) =>
                            `WHEN id = '${u.id}' THEN "viewCount" + ${u.count}`,
                    )
                    .join(" ");
                const ids = updates.map((u) => `'${u.id}'`).join(",");

                await prisma.$executeRawUnsafe(
                    `UPDATE videos SET "viewCount" = CASE ${cases} ELSE "viewCount" END WHERE id IN (${ids})`,
                );
                console.log(
                    `[ViewWorker] Flushed ${updates.length} video updates.`,
                );
            }
        }
    } catch (error) {
        console.error("[ViewWorker] Error flushing views:", error);
    } finally {
        await redis.del(KEYS.LOCK_VIEW_WORKER);
    }
}

// --- SHARED BATCH PROCESSORS ---

async function handleHistoryBatch(messages: [string, string[]][]) {
    // Parse Messages and group by user-video pairing to aggregate heartbeats
    const historyCurrent: Record<
        string,
        {
            userId: string;
            videoId: string;
            watchedSeconds: number; // Client cursor position
            lastWatchedAt: Date;
            heartbeatCount: number; // How many 10s pings in this batch
        }
    > = {};
    const messageIds: string[] = [];

    for (const [id, fields] of messages) {
        messageIds.push(id);
        const dataStr = fields[1];
        try {
            const data = JSON.parse(dataStr);
            const key = `${data.userId}:${data.videoId}`;

            if (!historyCurrent[key]) {
                historyCurrent[key] = {
                    userId: data.userId,
                    videoId: data.videoId,
                    watchedSeconds: data.seconds,
                    lastWatchedAt: new Date(data.timestamp),
                    heartbeatCount: 1,
                };
            } else {
                // Aggregate heartbeats locally
                const existing = historyCurrent[key];
                existing.heartbeatCount += 1;
                // keep the highest cursor
                if (data.seconds > existing.watchedSeconds) {
                    existing.watchedSeconds = data.seconds;
                }
                const newT = new Date(data.timestamp);
                if (newT > existing.lastWatchedAt) {
                    existing.lastWatchedAt = newT;
                }
            }
        } catch (e) {
            console.error("Failed to parse history item", dataStr);
        }
    }

    const upsertValues = Object.values(historyCurrent);

    if (upsertValues.length > 0) {
        // 1. Fetch Existing Watch History to calculate First-Time Views
        const existingHistory = await prisma.watch_history.findMany({
            where: {
                OR: upsertValues.map((v) => ({
                    userId: v.userId,
                    videoId: v.videoId,
                })),
            },
            select: { userId: true, videoId: true },
        });

        const existingSet = new Set(
            existingHistory.map((h) => `${h.userId}:${h.videoId}`),
        );

        // 2. Commit Core History Records
        await prisma.$transaction(
            upsertValues.map((v) =>
                prisma.watch_history.upsert({
                    where: {
                        userId_videoId: {
                            userId: v.userId,
                            videoId: v.videoId,
                        },
                    },
                    create: {
                        userId: v.userId,
                        videoId: v.videoId,
                        watchedSeconds: v.watchedSeconds,
                        lastWatchedAt: v.lastWatchedAt,
                    },
                    update: {
                        watchedSeconds: v.watchedSeconds, // Just map the raw cursor
                        lastWatchedAt: v.lastWatchedAt,
                        updatedAt: new Date(),
                    },
                }),
            ),
        );

        // 2.5 Invalidate Next.js Server Caches for all involved Users
        const uniqueUserIdsToInvalidate = [
            ...new Set(upsertValues.map((v) => v.userId)),
        ];
        await Promise.all(
            uniqueUserIdsToInvalidate.map((uId) =>
                HistoryService.invalidateUserCache(uId),
            ),
        );

        // 3. User Interests Updates
        const uniqueVideoIds = [...new Set(upsertValues.map((v) => v.videoId))];
        const videos = await prisma.videos.findMany({
            where: { id: { in: uniqueVideoIds } },
            include: { tags: true, category: true },
        });

        const videoMap = new Map(videos.map((v) => [v.id, v]));
        const interestMap = new Map<
            string,
            {
                type: "tag" | "category" | "channel";
                id: string;
                incScore: number;
                incWatchTime: number;
                incViewCount: number;
            }
        >();

        for (const update of upsertValues) {
            const vid = videoMap.get(update.videoId);
            if (!vid) continue;

            const isNewView = !existingSet.has(
                `${update.userId}:${update.videoId}`,
            );

            // Baseline additions based on heartbeat count (10s per ping)
            const addWatchTime = update.heartbeatCount * 10;
            // Only inflate the score and view multiplier on the very first time they watch it
            const addScore = isNewView ? 1.0 : 0.0;
            const addViews = isNewView ? 1 : 0;

            // 1. Tag Interests
            if (vid.tags && vid.tags.length > 0) {
                // To avoid massive inflation from 20 tags, divide the score weight
                const tagWeight = addScore / Math.max(1, vid.tags.length);
                for (const tag of vid.tags) {
                    const k = `${update.userId}:tag:${tag.id}`;
                    const prev = interestMap.get(k) || {
                        type: "tag",
                        id: tag.id,
                        incScore: 0,
                        incWatchTime: 0,
                        incViewCount: 0,
                    };
                    interestMap.set(k, {
                        ...prev,
                        incScore: prev.incScore + tagWeight,
                        incWatchTime: prev.incWatchTime + addWatchTime,
                        incViewCount: prev.incViewCount + addViews,
                    });
                }
            }

            // 2. Category Interests (Higher confidence, 1.0 weight)
            if (vid.categoryId) {
                const k = `${update.userId}:category:${vid.categoryId}`;
                const prev = interestMap.get(k) || {
                    type: "category",
                    id: vid.categoryId,
                    incScore: 0,
                    incWatchTime: 0,
                    incViewCount: 0,
                };
                interestMap.set(k, {
                    ...prev,
                    incScore: prev.incScore + addScore,
                    incWatchTime: prev.incWatchTime + addWatchTime,
                    incViewCount: prev.incViewCount + addViews,
                });
            }

            // 3. Channel Affinity (Implicit subscription likelihood, 1.0 weight)
            if (vid.channelId) {
                const k = `${update.userId}:channel:${vid.channelId}`;
                const prev = interestMap.get(k) || {
                    type: "channel",
                    id: vid.channelId,
                    incScore: 0,
                    incWatchTime: 0,
                    incViewCount: 0,
                };
                interestMap.set(k, {
                    ...prev,
                    incScore: prev.incScore + addScore,
                    incWatchTime: prev.incWatchTime + addWatchTime,
                    incViewCount: prev.incViewCount + addViews,
                });
            }
        }

        if (interestMap.size > 0) {
            const upserts = Array.from(interestMap.entries()).map(
                ([key, data]) => {
                    const userId = key.split(":")[0];
                    return prisma.user_interests.upsert({
                        where: {
                            ...(data.type === "tag" && {
                                userId_tagId: { userId, tagId: data.id },
                            }),
                            ...(data.type === "category" && {
                                userId_categoryId: {
                                    userId,
                                    categoryId: data.id,
                                },
                            }),
                            ...(data.type === "channel" && {
                                userId_channelId: {
                                    userId,
                                    channelId: data.id,
                                },
                            }),
                        } as any, // TypeScript union workaround
                        create: {
                            userId,
                            ...(data.type === "tag" && { tagId: data.id }),
                            ...(data.type === "category" && {
                                categoryId: data.id,
                            }),
                            ...(data.type === "channel" && {
                                channelId: data.id,
                            }),
                            score: Math.max(0.5, data.incScore),
                            watchTime: data.incWatchTime,
                            viewCount: Math.max(1, data.incViewCount),
                            lastSeenAt: new Date(),
                            firstSeenAt: new Date(),
                        },
                        update: {
                            score: { increment: data.incScore },
                            watchTime: { increment: data.incWatchTime },
                            viewCount: { increment: data.incViewCount },
                            lastSeenAt: new Date(),
                        },
                    });
                },
            );
            await prisma.$transaction(upserts);
        }
    }

    await redis.xack(KEYS.HISTORY_STREAM, GROUP_NAME, ...messageIds);
    console.log(`[HistoryWorker] Processed ${upsertValues.length} items`);
}

async function handleCommentCountBatch(messages: [string, string[]][]) {
    const messageIds: string[] = [];
    const videoUpdates = new Map<string, number>();
    const commentUpdates = new Map<string, number>();

    for (const [id, fields] of messages) {
        messageIds.push(id);

        // Parse fields: [key, val, key, val...]
        const data: Record<string, string> = {};
        for (let i = 0; i < fields.length; i += 2) {
            data[fields[i]] = fields[i + 1];
        }

        const entityId = data.entityId || data.videoId; // Backwards compatibility
        const type = data.type || "video"; // Default to video if missing
        const delta = parseInt(data.delta);

        const isValidId = /^[a-zA-Z0-9_-]+$/.test(entityId);

        if (isValidId && !isNaN(delta)) {
            if (type === "comment") {
                commentUpdates.set(
                    entityId,
                    (commentUpdates.get(entityId) || 0) + delta,
                );
            } else {
                videoUpdates.set(
                    entityId,
                    (videoUpdates.get(entityId) || 0) + delta,
                );
            }
        } else {
            console.warn(
                `[CommentCountWorker] Skipping invalid message: id=${entityId}, delta=${delta}`,
            );
        }
    }

    // 1. Update Videos
    if (videoUpdates.size > 0) {
        const sortedIds = Array.from(videoUpdates.keys()).sort();
        const cases = sortedIds
            .map((id) => {
                const delta = videoUpdates.get(id)!;
                return `WHEN id = '${id}' THEN GREATEST(0, "commentCount" + ${delta})`;
            })
            .join(" ");
        const ids = sortedIds.map((id) => `'${id}'`).join(",");

        await prisma.$executeRawUnsafe(
            `UPDATE videos SET "commentCount" = CASE ${cases} ELSE "commentCount" END WHERE id IN (${ids})`,
        );
    }

    // 2. Update Comments
    if (commentUpdates.size > 0) {
        const sortedIds = Array.from(commentUpdates.keys()).sort();
        const cases = sortedIds
            .map((id) => {
                const delta = commentUpdates.get(id)!;
                return `WHEN id = '${id}' THEN GREATEST(0, "replyCount" + ${delta})`;
            })
            .join(" ");
        const ids = sortedIds.map((id) => `'${id}'`).join(",");

        await prisma.$executeRawUnsafe(
            `UPDATE comments SET "replyCount" = CASE ${cases} ELSE "replyCount" END WHERE id IN (${ids})`,
        );
    }

    await redis.xack(KEYS.COMMENT_COUNT_STREAM, GROUP_NAME, ...messageIds);
    console.log(
        `[CommentCountWorker] Processed ${messageIds.length} updates (Videos: ${videoUpdates.size}, Comments: ${commentUpdates.size})`,
    );
}

async function handleEngagementBatch(messages: [string, string[]][]) {
    const messageIds: string[] = [];
    const reactions: {
        userId: string;
        videoId: string;
        type: "LIKE" | "DISLIKE" | "REMOVE";
    }[] = [];

    for (const [id, fields] of messages) {
        messageIds.push(id);
        const dataStr = fields[1];
        try {
            const data = JSON.parse(dataStr);
            reactions.push(data);
        } catch (e) {
            console.error("Failed to parse engagement item", dataStr);
        }
    }

    if (reactions.length > 0) {
        // 1. Aggregation for Video Counts
        const videoDeltas = new Map<
            string,
            { likeDelta: number; dislikeDelta: number }
        >();

        const finalUserStates = new Map<
            string,
            {
                userId: string;
                videoId: string;
                type: "LIKE" | "DISLIKE" | "REMOVE";
            }
        >();

        for (const r of reactions) {
            const key = `${r.userId}:${r.videoId}`;
            finalUserStates.set(key, r);
        }

        const userVideoPairs = Array.from(finalUserStates.values());

        // Batch Fetch Existing Reactions
        const existingReactions = await prisma.video_reactions.findMany({
            where: {
                OR: userVideoPairs.map((p) => ({
                    userId: p.userId,
                    videoId: p.videoId,
                })),
            },
            select: { userId: true, videoId: true, type: true },
        });

        const existingMap = new Map<string, "LIKE" | "DISLIKE">();
        existingReactions.forEach((r) =>
            existingMap.set(`${r.userId}:${r.videoId}`, r.type),
        );

        // Calculate Deltas with known previous state
        for (const r of userVideoPairs) {
            const key = `${r.userId}:${r.videoId}`;
            const prev = existingMap.get(key);
            const next = r.type;

            if (!videoDeltas.has(r.videoId)) {
                videoDeltas.set(r.videoId, {
                    likeDelta: 0,
                    dislikeDelta: 0,
                });
            }
            const deltas = videoDeltas.get(r.videoId)!;

            // State Machine
            if (next === "REMOVE") {
                if (prev === "LIKE") deltas.likeDelta--;
                if (prev === "DISLIKE") deltas.dislikeDelta--;
            } else if (next === "LIKE") {
                if (prev !== "LIKE") deltas.likeDelta++;
                if (prev === "DISLIKE") deltas.dislikeDelta--;
            } else if (next === "DISLIKE") {
                if (prev !== "DISLIKE") deltas.dislikeDelta++;
                if (prev === "LIKE") deltas.likeDelta--;
            }
        }

        // 3. Persist to DB
        // A. Batch Upsert Reactions
        const upserts = userVideoPairs
            .filter((r) => r.type !== "REMOVE")
            .map((r) =>
                prisma.video_reactions.upsert({
                    where: {
                        videoId_userId: {
                            videoId: r.videoId,
                            userId: r.userId,
                        },
                    },
                    create: {
                        videoId: r.videoId,
                        userId: r.userId,
                        type: r.type as "LIKE" | "DISLIKE",
                    },
                    update: { type: r.type as "LIKE" | "DISLIKE" },
                }),
            );

        const deletes = userVideoPairs
            .filter((r) => r.type === "REMOVE")
            .map((r) =>
                prisma.video_reactions.deleteMany({
                    where: { videoId: r.videoId, userId: r.userId },
                }),
            );

        // B. Batch Update Counts
        const sortedVideoIds = Array.from(videoDeltas.keys()).sort(); // SORTING FOR DEADLOCK PREVENTION
        const countUpdates: any[] = [];

        if (sortedVideoIds.length > 0) {
            const updates: {
                id: string;
                likeDelta: number;
                dislikeDelta: number;
            }[] = [];
            for (const vid of sortedVideoIds) {
                // Sanitize ID
                if (!/^[a-zA-Z0-9_-]+$/.test(vid)) continue;
                const d = videoDeltas.get(vid)!;
                if (d.likeDelta === 0 && d.dislikeDelta === 0) continue;
                updates.push({ id: vid, ...d });
            }

            if (updates.length > 0) {
                // Construct Bulk Update
                const likeCases = updates
                    .map(
                        (u) =>
                            `WHEN id = '${u.id}' THEN GREATEST(0, "likeCount" + ${u.likeDelta})`,
                    )
                    .join(" ");
                const dislikeCases = updates
                    .map(
                        (u) =>
                            `WHEN id = '${u.id}' THEN GREATEST(0, "dislikeCount" + ${u.dislikeDelta})`,
                    )
                    .join(" ");
                const ids = updates.map((u) => `'${u.id}'`).join(",");

                const query = `
                        UPDATE videos
                        SET "likeCount" = CASE ${likeCases} ELSE "likeCount" END,
                        "dislikeCount" = CASE ${dislikeCases} ELSE "dislikeCount" END
                        WHERE id IN (${ids})
                     `;

                // Add to transaction batch
                countUpdates.push(prisma.$executeRawUnsafe(query));
            }
        }

        await prisma.$transaction([...upserts, ...deletes, ...countUpdates]);

        // Fire VIDEO_LIKE notifications for new likes (non-blocking)
        const newLikes = userVideoPairs.filter((r) => {
            const prev = existingMap.get(`${r.userId}:${r.videoId}`);
            return r.type === "LIKE" && prev !== "LIKE";
        });

        if (newLikes.length > 0) {
            // Batch fetch video owners to avoid N+1
            const videoIds = [...new Set(newLikes.map((r) => r.videoId))];
            const videos = await prisma.videos.findMany({
                where: { id: { in: videoIds } },
                select: {
                    id: true,
                    title: true,
                    channelId: true,
                    channels: {
                        select: { userId: true },
                    },
                },
            });
            const videoMap = new Map(videos.map((v) => [v.id, v]));

            for (const like of newLikes) {
                const video = videoMap.get(like.videoId);
                if (!video || video.channels.userId === like.userId) continue; // Don't notify self-likes

                const truncated =
                    video.title.length > 50
                        ? video.title.substring(0, 50) + "..."
                        : video.title;
                NotificationService.notify({
                    userId: video.channels.userId,
                    actorId: like.userId,
                    type: "VIDEO_LIKE",
                    title: "Video Liked",
                    message: `liked your video: "${truncated}"`,
                    videoId: video.id,
                    channelId: video.channelId,
                    actionUrl: `/watch/${video.id}`,
                    groupKey: `VIDEO_LIKE:${video.id}`,
                }).catch((err) => {
                    console.error(
                        "[VideoEngagement] Failed to send like notification",
                        err,
                    );
                });
            }
        }
    }

    await redis.xack(KEYS.ENGAGEMENT_STREAM, GROUP_NAME, ...messageIds);
    console.log(`[EngagementWorker] Processed ${messageIds.length} events`);
}

async function handleCommentEngagementBatch(messages: [string, string[]][]) {
    const messageIds: string[] = [];
    const reactions: {
        userId: string;
        commentId: string;
        videoId: string;
        type: "LIKE" | "DISLIKE" | "REMOVE";
    }[] = [];

    for (const [id, fields] of messages) {
        messageIds.push(id);
        try {
            const data = JSON.parse(fields[1]);
            reactions.push(data);
        } catch (e) {
            console.error("Failed to parse comment engagement item", fields[1]);
        }
    }

    if (reactions.length > 0) {
        // Dedup by user:comment
        const uniqueReactions = new Map<string, (typeof reactions)[0]>();
        for (const r of reactions) {
            uniqueReactions.set(`${r.userId}:${r.commentId}`, r);
        }
        const userCommentPairs = Array.from(uniqueReactions.values());

        // Batch Fetch Existing
        const existing = await prisma.comment_reactions.findMany({
            where: {
                OR: userCommentPairs.map((p) => ({
                    commentId: p.commentId,
                    userId: p.userId,
                })),
            },
            select: { commentId: true, userId: true, type: true },
        });

        const existingMap = new Map<string, "LIKE" | "DISLIKE">();
        existing.forEach((r) =>
            existingMap.set(`${r.userId}:${r.commentId}`, r.type),
        );

        // Compute Deltas
        const commentDeltas = new Map<
            string,
            { likeDelta: number; dislikeDelta: number }
        >();

        for (const r of userCommentPairs) {
            const key = `${r.userId}:${r.commentId}`;
            const prev = existingMap.get(key);
            const next = r.type;

            if (!commentDeltas.has(r.commentId)) {
                commentDeltas.set(r.commentId, {
                    likeDelta: 0,
                    dislikeDelta: 0,
                });
            }
            const deltas = commentDeltas.get(r.commentId)!;

            if (next === "REMOVE") {
                if (prev === "LIKE") deltas.likeDelta--;
                if (prev === "DISLIKE") deltas.dislikeDelta--;
            } else if (next === "LIKE") {
                if (prev !== "LIKE") deltas.likeDelta++;
                if (prev === "DISLIKE") deltas.dislikeDelta--;
            } else if (next === "DISLIKE") {
                if (prev !== "DISLIKE") deltas.dislikeDelta++;
                if (prev === "LIKE") deltas.likeDelta--;
            }
        }

        // DB Updates
        const upserts = userCommentPairs
            .filter((r) => r.type !== "REMOVE")
            .map((r) =>
                prisma.comment_reactions.upsert({
                    where: {
                        commentId_userId: {
                            commentId: r.commentId,
                            userId: r.userId,
                        },
                    },
                    create: {
                        commentId: r.commentId,
                        userId: r.userId,
                        type: r.type as "LIKE" | "DISLIKE",
                    },
                    update: { type: r.type as "LIKE" | "DISLIKE" },
                }),
            );

        const deletes = userCommentPairs
            .filter((r) => r.type === "REMOVE")
            .map((r) =>
                prisma.comment_reactions.deleteMany({
                    where: { commentId: r.commentId, userId: r.userId },
                }),
            );

        const countUpdates: any[] = [];
        const sortedCommentIds = Array.from(commentDeltas.keys()).sort();

        if (sortedCommentIds.length > 0) {
            const updates = [];
            for (const id of sortedCommentIds) {
                // Sanitize ID
                if (!/^[a-zA-Z0-9_-]+$/.test(id)) continue;
                const d = commentDeltas.get(id)!;
                if (d.likeDelta !== 0 || d.dislikeDelta !== 0) {
                    updates.push({ id, ...d });
                }
            }

            if (updates.length > 0) {
                const likeCases = updates
                    .map(
                        (u) =>
                            `WHEN id = '${u.id}' THEN GREATEST(0, "likeCount" + ${u.likeDelta})`,
                    )
                    .join(" ");
                const dislikeCases = updates
                    .map(
                        (u) =>
                            `WHEN id = '${u.id}' THEN GREATEST(0, "dislikeCount" + ${u.dislikeDelta})`,
                    )
                    .join(" ");
                const ids = updates.map((u) => `'${u.id}'`).join(",");

                const query = `
                    UPDATE comments
                    SET "likeCount" = CASE ${likeCases} ELSE "likeCount" END,
                        "dislikeCount" = CASE ${dislikeCases} ELSE "dislikeCount" END
                    WHERE id IN (${ids})
                 `;
                countUpdates.push(prisma.$executeRawUnsafe(query));
            }
        }

        await prisma.$transaction([...upserts, ...deletes, ...countUpdates]);

        // Fire COMMENT_LIKE notifications for new likes (non-blocking)
        const newLikes = userCommentPairs.filter((r) => {
            const prev = existingMap.get(`${r.userId}:${r.commentId}`);
            return r.type === "LIKE" && prev !== "LIKE";
        });

        if (newLikes.length > 0) {
            // Batch fetch comment owners to avoid N+1
            const commentIds = [...new Set(newLikes.map((r) => r.commentId))];
            const comments = await prisma.comments.findMany({
                where: { id: { in: commentIds } },
                select: {
                    id: true,
                    userId: true,
                    videoId: true,
                    content: true,
                },
            });
            const commentMap = new Map(comments.map((c) => [c.id, c]));

            for (const like of newLikes) {
                const comment = commentMap.get(like.commentId);
                if (!comment || comment.userId === like.userId) continue; // Don't notify self-likes

                const truncated =
                    comment.content.length > 50
                        ? comment.content.substring(0, 50) + "..."
                        : comment.content;
                NotificationService.notify({
                    userId: comment.userId,
                    actorId: like.userId,
                    type: "COMMENT_LIKE",
                    title: "Comment Liked",
                    message: `liked your comment: "${truncated}"`,
                    videoId: comment.videoId,
                    commentId: comment.id,
                    actionUrl: `/watch/${comment.videoId}?lc=${comment.id}`,
                    groupKey: `COMMENT_LIKE:${comment.id}`,
                }).catch((err) => {
                    console.error(
                        "[CommentEngagement] Failed to send like notification",
                        err,
                    );
                });
            }
        }
    }

    await redis.xack(KEYS.COMMENT_ENGAGEMENT_STREAM, GROUP_NAME, ...messageIds);
    console.log(`[CommentEngagement] Processed ${messageIds.length} events`);
}

/**
 * 2. History Worker (Reliable Lane)
 * Consume from Redis Stream -> Bulk Upsert DB
 */
async function processHistory() {
    // Leader Election (To prevent overwriting newer history with older history if race condition)
    const locked = await redis.set(
        KEYS.LOCK_HISTORY_WORKER,
        "1",
        "EX",
        15,
        "NX",
    );
    if (!locked) return;

    try {
        // Ensure Group Exists
        try {
            await redis.xgroup(
                "CREATE",
                KEYS.HISTORY_STREAM,
                GROUP_NAME,
                "0",
                "MKSTREAM",
            );
        } catch (e: any) {
            if (!e.message.includes("BUSYGROUP")) throw e;
        }

        // Read Batch
        const response = await redis.xreadgroup(
            "GROUP",
            GROUP_NAME,
            CONSUMER_NAME,
            "COUNT",
            500, // Batch size
            "BLOCK",
            2000, // Wait 2s if empty
            "STREAMS",
            KEYS.HISTORY_STREAM,
            ">",
        );

        if (!response) return;

        const streams = response as any;
        const [streamName, messages] = streams[0];
        if (!messages || messages.length === 0) return;

        await handleHistoryBatch(messages);
    } catch (error) {
        console.error("[HistoryWorker] Error:", error);
    } finally {
        await redis.del(KEYS.LOCK_HISTORY_WORKER);
    }
}

/**
 * 3. Engagement Worker (Fast Lane -> Slow Lane)
 * Consumes Like/Dislike events and updates DB
 */
async function processEngagement() {
    // Leader Election to prevent concurrent processing of same user events (race condition)
    const locked = await redis.set(
        KEYS.LOCK_ENGAGEMENT_WORKER,
        "1",
        "EX",
        15,
        "NX",
    );
    if (!locked) return;

    try {
        // Ensure Group Exists
        try {
            await redis.xgroup(
                "CREATE",
                KEYS.ENGAGEMENT_STREAM,
                GROUP_NAME,
                "0",
                "MKSTREAM",
            );
        } catch (e: any) {
            if (!e.message.includes("BUSYGROUP")) throw e;
        }

        const response = await redis.xreadgroup(
            "GROUP",
            GROUP_NAME,
            CONSUMER_NAME,
            "COUNT",
            500,
            "BLOCK",
            2000,
            "STREAMS",
            KEYS.ENGAGEMENT_STREAM,
            ">",
        );

        if (!response) return;

        const streams = response as any;
        const [streamName, messages] = streams[0];
        if (!messages || messages.length === 0) return;

        await handleEngagementBatch(messages);
    } catch (error) {
        console.error("[EngagementWorker] Error:", error);
    } finally {
        await redis.del(KEYS.LOCK_ENGAGEMENT_WORKER);
    }
}

async function processCommentEngagement() {
    const locked = await redis.set("lock:comment-worker", "1", "EX", 15, "NX");
    if (!locked) return;

    try {
        try {
            await redis.xgroup(
                "CREATE",
                KEYS.COMMENT_ENGAGEMENT_STREAM,
                GROUP_NAME,
                "0",
                "MKSTREAM",
            );
        } catch (e: any) {
            if (!e.message.includes("BUSYGROUP")) throw e;
        }

        const response = await redis.xreadgroup(
            "GROUP",
            GROUP_NAME,
            CONSUMER_NAME,
            "COUNT",
            500,
            "BLOCK",
            2000,
            "STREAMS",
            KEYS.COMMENT_ENGAGEMENT_STREAM,
            ">",
        );

        if (!response) return;
        const [streamName, messages] = (response as any)[0];
        if (messages.length > 0) await handleCommentEngagementBatch(messages);
    } catch (e) {
        console.error("[CommentWorker] Error:", e);
    } finally {
        await redis.del("lock:comment-worker");
    }
}

async function processCommentCounts() {
    const locked = await redis.set(
        "lock:comment-count-worker",
        "1",
        "EX",
        15,
        "NX",
    );
    if (!locked) return;

    try {
        try {
            await redis.xgroup(
                "CREATE",
                KEYS.COMMENT_COUNT_STREAM,
                GROUP_NAME,
                "0",
                "MKSTREAM",
            );
        } catch (e: any) {
            if (!e.message.includes("BUSYGROUP")) throw e;
        }

        const response = await redis.xreadgroup(
            "GROUP",
            GROUP_NAME,
            CONSUMER_NAME,
            "COUNT",
            500,
            "BLOCK",
            2000,
            "STREAMS",
            KEYS.COMMENT_COUNT_STREAM,
            ">",
        );

        if (!response) return;
        const [streamName, messages] = (response as any)[0];
        if (messages.length > 0) await handleCommentCountBatch(messages);
    } catch (e) {
        console.error("[CommentCountWorker] Error:", e);
    } finally {
        await redis.del("lock:comment-count-worker");
    }
}

async function handleNotificationBatch(messages: [string, string[]][]) {
    const messageIds: string[] = [];
    const notifications: any[] = [];

    for (const [id, fields] of messages) {
        messageIds.push(id);
        try {
            // Check if fields is JSON or Key-Value
            // XADD sends key-value pairs. user manually sent "data", "JSON_STRING"
            // So fields is ["data", "{...}"]

            // Find "data" field
            let dataStr = "";
            for (let i = 0; i < fields.length; i += 2) {
                if (fields[i] === "data") {
                    dataStr = fields[i + 1];
                    break;
                }
            }

            if (dataStr) {
                const data = JSON.parse(dataStr);
                notifications.push(data);
            }
        } catch (e) {
            console.error("Failed to parse notification item", fields);
        }
    }

    if (notifications.length > 0) {
        // Batch insert and get IDs + actor data for Pub/Sub
        const createdNotifications =
            await prisma.notifications.createManyAndReturn({
                data: notifications.map((n) => ({
                    userId: n.userId,
                    actorId: n.actorId || null,
                    type: n.type,
                    title: n.title,
                    message: n.message,
                    videoId: n.videoId,
                    commentId: n.commentId,
                    channelId: n.channelId,
                    thumbnailUrl: n.thumbnailUrl,
                    actionUrl: n.actionUrl,
                    metadata: n.metadata || null,
                    groupKey: n.groupKey || null,
                    groupCount: n.groupCount || 1,
                    isRead: false,
                })),
                include: {
                    user_notifications_actorIdTouser: {
                        select: {
                            id: true,
                            name: true,
                            image: true,
                        },
                    },
                },
            });

        // 2. Publish to Redis Pub/Sub (Realtime)
        createdNotifications.forEach((notification) => {
            const channel = `user:notifications:${notification.userId}`;
            redisPub
                .publish(channel, JSON.stringify(notification))
                .catch((e) => console.error("PubSub fail", e));
        });
    }

    await redis.xack(KEYS.NOTIFICATION_STREAM, GROUP_NAME, ...messageIds);
    console.log(
        `[NotificationWorker] Processed ${messageIds.length} notifications`,
    );
}

async function processNotifications() {
    const locked = await redis.set(
        "lock:notification-worker",
        "1",
        "EX",
        15,
        "NX",
    );
    if (!locked) return;

    try {
        try {
            await redis.xgroup(
                "CREATE",
                KEYS.NOTIFICATION_STREAM,
                GROUP_NAME,
                "0",
                "MKSTREAM",
            );
        } catch (e: any) {
            if (!e.message.includes("BUSYGROUP")) throw e;
        }

        const response = await redis.xreadgroup(
            "GROUP",
            GROUP_NAME,
            CONSUMER_NAME,
            "COUNT",
            100, // Batch 100
            "BLOCK",
            2000,
            "STREAMS",
            KEYS.NOTIFICATION_STREAM,
            ">",
        );

        if (!response) return;
        const [streamName, messages] = (response as any)[0];
        if (messages.length > 0) await handleNotificationBatch(messages);
    } catch (e) {
        console.error("[NotificationWorker] Error:", e);
    } finally {
        await redis.del("lock:notification-worker");
    }
}

async function recoverPending(
    streamKey: string,
    handler: (msgs: [string, string[]][]) => Promise<void>,
) {
    console.log(`[Worker] Recovering pending messages for ${streamKey}...`);
    try {
        // Create group if not exists (safeguard)
        try {
            await redis.xgroup(
                "CREATE",
                streamKey,
                GROUP_NAME,
                "0",
                "MKSTREAM",
            );
        } catch (e: any) {
            if (!e.message.includes("BUSYGROUP")) throw e;
        }

        // Loop until no pending messages
        while (true) {
            const response = await redis.xreadgroup(
                "GROUP",
                GROUP_NAME,
                CONSUMER_NAME,
                "COUNT",
                100,
                "STREAMS",
                streamKey,
                "0", // ID '0' means "Pending Entry List"
            );

            if (!response) break;

            const streams = response as any;
            const [streamName, messages] = streams[0];
            if (!messages || messages.length === 0) break;

            console.log(
                `[Worker] Recovered ${messages.length} pending messages from ${streamKey}`,
            );
            await handler(messages);
        }
    } catch (error) {
        console.error(`[Worker] Failed recovery for ${streamKey}:`, error);
    }
}

/**
 * NEW_VIDEO Fan-Out Handler
 * When a video is published (made PUBLIC), fan out notifications to all subscribers.
 * Uses skip-based pagination to avoid loading all subscribers into memory.
 */
async function handleNewVideoBatch(messages: [string, string[]][]) {
    const messageIds: string[] = [];
    const events: {
        channelId: string;
        videoId: string;
        title: string;
        thumbnailUrl?: string;
        channelName?: string;
        channelHandle?: string;
    }[] = [];

    for (const [id, fields] of messages) {
        messageIds.push(id);
        try {
            let dataStr = "";
            for (let i = 0; i < fields.length; i += 2) {
                if (fields[i] === "data") {
                    dataStr = fields[i + 1];
                    break;
                }
            }
            if (dataStr) events.push(JSON.parse(dataStr));
        } catch (e) {
            console.error("[NewVideoWorker] Failed to parse event", e);
        }
    }

    const BATCH_SIZE = 500;

    for (const event of events) {
        // Dedup: fast existence check (uses @@index([videoId, type]))
        const alreadySent = await prisma.notifications.findFirst({
            where: { videoId: event.videoId, type: "NEW_VIDEO" },
            select: { id: true },
        });
        if (alreadySent) {
            console.log(
                `[NewVideoWorker] Skipping duplicate fan-out for video ${event.videoId}`,
            );
            continue;
        }

        let totalNotified = 0;
        let lastId: string | undefined;

        // Cursor-based pagination for fan-out (no performance degradation at scale)
        while (true) {
            const subscribers = await prisma.subscriptions.findMany({
                where: {
                    channelId: event.channelId,
                    notificationLevel: { not: "NONE" },
                    ...(lastId ? { id: { gt: lastId } } : {}),
                },
                select: { id: true, subscriberId: true },
                take: BATCH_SIZE,
                orderBy: { id: "asc" },
            });

            if (subscribers.length === 0) break;
            lastId = subscribers[subscribers.length - 1].id;

            // Respect notification_settings: exclude users who disabled newVideos
            const subscriberIds = subscribers.map((s) => s.subscriberId);
            const optedOut = await prisma.notification_settings.findMany({
                where: {
                    userId: { in: subscriberIds },
                    newVideos: false,
                },
                select: { userId: true },
            });
            const optedOutSet = new Set(optedOut.map((o) => o.userId));
            const eligibleSubscribers = subscribers.filter(
                (s) => !optedOutSet.has(s.subscriberId),
            );

            if (eligibleSubscribers.length === 0) {
                if (subscribers.length < BATCH_SIZE) break;
                continue;
            }

            // Store channel info in metadata (not Pub/Sub enrichment)
            const notifMetadata = {
                channelName: event.channelName || null,
                channelHandle: event.channelHandle || null,
            };

            // Batch insert notifications
            const created = await prisma.notifications.createManyAndReturn({
                data: eligibleSubscribers.map((sub) => ({
                    userId: sub.subscriberId,
                    type: "NEW_VIDEO" as const,
                    title: "New Video",
                    message: `${event.channelName || "A channel"} uploaded: "${event.title.length > 60 ? event.title.substring(0, 60) + "..." : event.title}"`,
                    videoId: event.videoId,
                    channelId: event.channelId,
                    thumbnailUrl: event.thumbnailUrl || null,
                    actionUrl: `/watch/${event.videoId}`,
                    metadata: notifMetadata,
                    isRead: false,
                })),
            });

            // Publish to Pub/Sub for real-time delivery
            for (const notification of created) {
                const channel = `user:notifications:${notification.userId}`;
                redisPub
                    .publish(channel, JSON.stringify(notification))
                    .catch((e) =>
                        console.error("[NewVideoWorker] PubSub fail", e),
                    );
            }

            totalNotified += eligibleSubscribers.length;

            if (subscribers.length < BATCH_SIZE) break;

            // Small delay between batches to avoid overwhelming the DB
            await new Promise((r) => setTimeout(r, 50));
        }

        console.log(
            `[NewVideoWorker] Notified ${totalNotified} subscribers for video ${event.videoId}`,
        );
    }

    await redis.xack(KEYS.NEW_VIDEO_STREAM, GROUP_NAME, ...messageIds);
}

async function processNewVideoNotifications() {
    const locked = await redis.set(
        "lock:new-video-worker",
        "1",
        "EX",
        30, // Longer lock since fan-out can take time
        "NX",
    );
    if (!locked) return;

    try {
        try {
            await redis.xgroup(
                "CREATE",
                KEYS.NEW_VIDEO_STREAM,
                GROUP_NAME,
                "0",
                "MKSTREAM",
            );
        } catch (e: any) {
            if (!e.message.includes("BUSYGROUP")) throw e;
        }

        const response = await redis.xreadgroup(
            "GROUP",
            GROUP_NAME,
            CONSUMER_NAME,
            "COUNT",
            5, // Small batch — each event can fan out to thousands
            "BLOCK",
            2000,
            "STREAMS",
            KEYS.NEW_VIDEO_STREAM,
            ">",
        );

        if (!response) return;
        const [, messages] = (response as any)[0];
        if (messages.length > 0) await handleNewVideoBatch(messages);
    } catch (e) {
        console.error("[NewVideoWorker] Error:", e);
    } finally {
        await redis.del("lock:new-video-worker");
    }
}

// Export startup function
// Lifecycle control
let IS_RUNNING = false;
let VIEW_FLUSH_INTERVAL: NodeJS.Timeout | null = null;

export function startEngagementWorker() {
    if (IS_RUNNING) return;
    IS_RUNNING = true;
    console.log("[Engagement Worker] Starting...");

    const runLoop = async (fn: () => Promise<void>, name: string) => {
        while (IS_RUNNING) {
            try {
                await fn();
                if (!IS_RUNNING) break;
                await new Promise((r) => setTimeout(r, 10));
            } catch (e) {
                console.error(`[${name}] Crash:`, e);
                await new Promise((r) => setTimeout(r, 5000));
            }
        }
    };

    // Run Recovery Logic Once
    Promise.all([
        recoverPending(KEYS.HISTORY_STREAM, handleHistoryBatch),
        recoverPending(KEYS.ENGAGEMENT_STREAM, handleEngagementBatch),
        recoverPending(
            KEYS.COMMENT_ENGAGEMENT_STREAM,
            handleCommentEngagementBatch,
        ),
        recoverPending(KEYS.COMMENT_COUNT_STREAM, handleCommentCountBatch),
        recoverPending(KEYS.NOTIFICATION_STREAM, handleNotificationBatch),
        recoverPending(KEYS.NEW_VIDEO_STREAM, handleNewVideoBatch),
    ]).then(() => {
        console.log("[Engagement Worker] Recovery Complete. Starting loops.");
        runLoop(processHistory, "HistoryLoop");
        runLoop(processEngagement, "EngagementLoop");
        runLoop(processCommentEngagement, "CommentLoop");
        runLoop(processCommentCounts, "CommentCountLoop");
        runLoop(processNotifications, "NotificationLoop");
        runLoop(processNewVideoNotifications, "NewVideoLoop");
    });

    processViews().catch((e) => console.error(e));

    VIEW_FLUSH_INTERVAL = setInterval(processViews, 5000);
}

export async function stopWorker() {
    console.log("[Engagement Worker] Stopping...");
    IS_RUNNING = false;
    if (VIEW_FLUSH_INTERVAL) {
        clearInterval(VIEW_FLUSH_INTERVAL);
    }
}
