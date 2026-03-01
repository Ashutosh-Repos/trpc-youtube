import { prisma } from "../lib/prisma";
import redis from "../lib/redis";

export class HistoryService {
    private static PAGE_SIZE = 20;

    /**
     * Get watch history with infinite scrolling.
     * Uses DataCache to cache the first page per user for fast reads.
     */
    public static async getHistory(
        userId: string,
        limit: number = this.PAGE_SIZE,
        cursor?: string,
    ) {
        // Cache Key specifically for the first page
        const cacheKey = `history:${userId}:page:1:${limit}`;

        if (!cursor) {
            const cached = await redis.get(cacheKey);
            if (cached) {
                try {
                    return JSON.parse(cached);
                } catch (e) {
                    console.error("Failed to parse cached history:", e);
                }
            }

            // Cache miss, fetch from DB
            const freshData = await this.fetchHistoryFromDatabase(
                userId,
                limit,
                cursor,
            );
            // Cache for 5 minutes (invalidated proactively by workers/mutations)
            await redis.set(cacheKey, JSON.stringify(freshData), "EX", 60 * 5);
            return freshData;
        }

        // Subsequent pages always hit DB (no cache to avoid massive memory bloat)
        return await this.fetchHistoryFromDatabase(userId, limit, cursor);
    }

    private static async fetchHistoryFromDatabase(
        userId: string,
        limit: number,
        cursor?: string,
    ) {
        const items = await prisma.watch_history.findMany({
            take: limit + 1,
            where: {
                userId,
                videos: {
                    visibility: { in: ["PUBLIC", "UNLISTED"] },
                    deletedAt: null,
                    processingStatus: "READY",
                },
            },
            cursor: cursor ? { id: cursor } : undefined,
            orderBy: [
                { lastWatchedAt: "desc" },
                { id: "desc" }, // Stable tie-breaker
            ],
            include: {
                videos: {
                    select: {
                        id: true,
                        title: true,
                        thumbnailUrl: true,
                        description: true,
                        viewCount: true,
                        createdAt: true,
                        duration: true,
                        isShort: true,
                        channels: {
                            select: {
                                id: true,
                                name: true,
                                handle: true,
                                image: true,
                            },
                        },
                    },
                },
            },
        });

        let nextCursor: typeof cursor | undefined = undefined;
        if (items.length > limit) {
            const nextItem = items.pop();
            nextCursor = nextItem!.id;
        }

        return {
            items,
            nextCursor,
        };
    }

    /**
     * Invalidate the history cache for a specific user.
     * Executed by background workers and history mutations.
     */
    public static async invalidateUserCache(userId: string) {
        // Since Redis doesn't have an invalidatePattern, we can just delete page 1
        // as that's the only page we explicitly cache.
        const keys = await redis.keys(`history:${userId}:*`);
        if (keys.length > 0) {
            await redis.del(...keys);
        }
    }
}
