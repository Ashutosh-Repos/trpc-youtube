import redis from "../lib/redis";
import { prisma } from "../lib/prisma"; // Assuming lib/prisma exports prisma instance
import os from "os";

const KEYS = {
    HISTORY_STREAM: "queue:history",
    ENGAGEMENT_STREAM: "queue:engagement",
    VIDEO_VIEW_BUFFER: "video:v:buf",
    VIDEO_VIEW_DIRTY: "video:v:dirty",
    LOCK_VIEW_WORKER: "lock:view-worker",
    LOCK_ENGAGEMENT_WORKER: "lock:engagement-worker",
    LOCK_HISTORY_WORKER: "lock:history-worker",
};

const GROUP_NAME = "history_workers";
// STABLE CONSUMER NAME (No PID) for recovery
const CONSUMER_NAME = `worker:${os.hostname() || "local"}`;

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
                updates.push({ id: result[j], count: parseInt(result[j + 1]) });
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
    // Parse Messages
    const historyCurrent: Record<string, any> = {}; // Dedupe by user:video in this batch
    const messageIds: string[] = [];

    for (const [id, fields] of messages) {
        messageIds.push(id);
        const dataStr = fields[1];
        try {
            const data = JSON.parse(dataStr);
            const key = `${data.userId}:${data.videoId}`;
            historyCurrent[key] = {
                userId: data.userId,
                videoId: data.videoId,
                watchedSeconds: data.seconds,
                lastWatchedAt: new Date(data.timestamp),
            };
        } catch (e) {
            console.error("Failed to parse history item", dataStr);
        }
    }

    const upsertValues = Object.values(historyCurrent);

    if (upsertValues.length > 0) {
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
                        watchedSeconds: v.watchedSeconds,
                        lastWatchedAt: v.lastWatchedAt,
                    },
                }),
            ),
        );

        // ... (Interest Scoring Logic - kept same)
        const uniqueVideoIds = [...new Set(upsertValues.map((v) => v.videoId))];
        const videos = await prisma.videos.findMany({
            where: { id: { in: uniqueVideoIds as string[] } },
            include: { tags: true, category: true },
        });

        const videoMap = new Map(videos.map((v) => [v.id, v]));
        const interestMap = new Map<string, number>();

        for (const update of upsertValues) {
            const vid = videoMap.get(update.videoId);
            if (!vid) continue;
            if (vid.tags) {
                for (const tag of vid.tags) {
                    const k = `${update.userId}:${tag.id}`;
                    interestMap.set(k, (interestMap.get(k) || 0) + 1);
                }
            }
        }

        if (interestMap.size > 0) {
            const upserts = Array.from(interestMap.entries()).map(
                ([key, inc]) => {
                    const [userId, tagId] = key.split(":");
                    return prisma.user_interests.upsert({
                        where: { userId_tagId: { userId, tagId } },
                        create: {
                            userId,
                            tagId,
                            score: inc,
                            lastSeenAt: new Date(),
                            firstSeenAt: new Date(),
                        },
                        update: {
                            score: { increment: inc },
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
    }

    await redis.xack(KEYS.ENGAGEMENT_STREAM, GROUP_NAME, ...messageIds);
    console.log(`[EngagementWorker] Processed ${messageIds.length} events`);
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
    ]).then(() => {
        console.log("[Engagement Worker] Recovery Complete. Starting loops.");
        runLoop(processHistory, "HistoryLoop");
        runLoop(processEngagement, "EngagementLoop");
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
