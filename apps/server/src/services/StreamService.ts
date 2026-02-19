import redis from "../lib/redis";

export class StreamService {
    /**
     * Add a view item to the "Fast Lane" buffer.
     * Uses HyperLogLog for unique counts and Atomic Counters for total views.
     */
    static async addViewItem(videoId: string, ip: string, userAgent: string) {
        // 1. Check uniqueness using HyperLogLog
        // Key: video:u:{videoId}
        const uniqueKey = `video:u:${videoId}`;
        const uniqueElement = `${ip}-${userAgent}`; // Simple composite key

        const isNew = await redis.pfadd(uniqueKey, uniqueElement);
        if (isNew) await redis.expire(uniqueKey, 86400); // 24h TTL for de-duplication window

        if (isNew) {
            // 2. Increment buffer (Hash + Dirty Set)
            // Key: video:v:buf (Hash) -> Field: videoId
            // Key: video:v:dirty (Set) -> Member: videoId
            // Pipeline to ensure atomicity
            const pipeline = redis.pipeline();
            pipeline.hincrby("video:v:buf", videoId, 1);
            pipeline.sadd("video:v:dirty", videoId);
            await pipeline.exec();
        }
    }

    /**
     * Add a history item to the "Reliable Lane" stream.
     * Uses Redis Streams to queue updates for the background worker.
     * Also updates the "Session" cache for immediate read access (Hybrid Read).
     */
    static async addHistoryItem(
        userId: string,
        videoId: string,
        seconds: number,
    ) {
        const timestamp = Date.now();

        const pipeline = redis.pipeline();

        // 1. Update Session Cache (Hybrid Read)
        // Key: session:{userId}:{videoId}
        // Expires in 24 hours to keep Redis lean
        const sessionKey = `session:${userId}:${videoId}`;
        pipeline.set(
            sessionKey,
            JSON.stringify({
                watchedSeconds: seconds,
                lastWatchedAt: new Date(timestamp).toISOString(),
            }),
            "EX",
            86400,
        ); // 1 day TTL

        // 2. Push to Stream (Write-Behind)
        // Key: queue:history
        // MaxLen approx 1000000 to prevent overflow if worker dies
        pipeline.xadd(
            "queue:history",
            "MAXLEN",
            "~",
            1000000,
            "*",
            "data",
            JSON.stringify({
                userId,
                videoId,
                seconds,
                timestamp,
            }),
        );

        await pipeline.exec();
    }

    /**
     * Get merged history for Hybrid Read-Repair.
     * Combines DB history with active Redis session data.
     */
    static async getMergedHistory(
        userId: string,
        videoId: string,
        dbHistory: { watchedSeconds: number; lastWatchedAt: Date } | null,
    ) {
        const sessionKey = `session:${userId}:${videoId}`;
        const sessionData = await redis.get(sessionKey);

        let merged = dbHistory ? { ...dbHistory } : null;

        if (sessionData) {
            try {
                const session = JSON.parse(sessionData);
                const sessionSeconds = Number(session.watchedSeconds);
                const sessionDate = new Date(session.lastWatchedAt);

                if (!merged) {
                    merged = {
                        watchedSeconds: sessionSeconds,
                        lastWatchedAt: sessionDate,
                    };
                } else {
                    // Hybrid Merge: Take the one with later timestamp or higher seconds
                    if (
                        sessionDate > merged.lastWatchedAt ||
                        sessionSeconds > merged.watchedSeconds
                    ) {
                        merged.watchedSeconds = Math.max(
                            merged.watchedSeconds,
                            sessionSeconds,
                        );
                        merged.lastWatchedAt =
                            sessionDate > merged.lastWatchedAt
                                ? sessionDate
                                : merged.lastWatchedAt;
                    }
                }
            } catch (e) {
                console.warn("Failed to parse session data", e);
            }
        }

        return merged;
    }
    /**
     * Clear session cache for a specific video.
     * Called when removing a video from history.
     */
    static async clearSession(userId: string, videoId: string) {
        const sessionKey = `session:${userId}:${videoId}`;
        await redis.del(sessionKey);
    }

    /**
     * Clear all session caches for a user.
     * Called when clearing all history.
     * Uses SCAN to find and delete keys iteratively to avoid blocking.
     */
    static async clearAllSessions(userId: string) {
        const match = `session:${userId}:*`;
        let cursor = "0";

        do {
            const [nextCursor, keys] = await redis.scan(
                cursor,
                "MATCH",
                match,
                "COUNT",
                100,
            );
            cursor = nextCursor;

            if (keys.length > 0) {
                await redis.del(...keys);
            }
        } while (cursor !== "0");
    }
    /**
     * Add a reaction (Like/Dislike) to the stream.
     * 1. Updates User Cache (Fast Lane Read) - TTL 24h
     * 2. Pushes to Redis Stream (Write Behind)
     */
    static async addReaction(
        userId: string,
        videoId: string,
        type: "LIKE" | "DISLIKE" | "REMOVE",
    ) {
        const reactionKey = `user:reaction:${userId}:${videoId}`;
        const timestamp = Date.now();

        const pipeline = redis.pipeline();

        // 1. Update User Cache (Read-Your-Own-Write)
        // We set "REMOVE" explicitly so Hybrid Read knows the user intentionally removed it
        // even if DB still has the old record.
        if (type === "REMOVE") {
            pipeline.set(reactionKey, "REMOVE", "EX", 86400);
        } else {
            pipeline.set(reactionKey, type, "EX", 86400); // 24h TTL
        }

        // 2. Push to Stream
        pipeline.xadd(
            "queue:engagement",
            "MAXLEN",
            "~",
            1000000,
            "*",
            "data",
            JSON.stringify({
                userId,
                videoId,
                type,
                timestamp,
            }),
        );

        await pipeline.exec();
    }

    /**
     * Get user's current reaction from Cache.
     * Used for Hybrid Read.
     */
    static async getUserReaction(userId: string, videoId: string) {
        try {
            const reactionKey = `user:reaction:${userId}:${videoId}`;
            const cached = await redis.get(reactionKey);
            return cached as "LIKE" | "DISLIKE" | "REMOVE" | null;
        } catch (e) {
            console.warn("Failed to get user reaction from cache", e);
            return null; // Fallback to DB
        }
    }
}
