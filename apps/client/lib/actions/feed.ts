"use server";

import prisma from "@/lib/prisma";
import { getSessionUser } from "./user";
import { ActionResponse, createErrorResponse } from "./schema-types";

// =============================================================================
// TYPES
// =============================================================================

export interface VideoCardData {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    previewSprite: string | null;
    duration: number | null;
    viewCount: number;
    publishedAt: Date | null;
    // Denormalized - no JOIN needed
    channelId: string;
    channelName: string | null;
    channelImage: string | null;
    channelHandle: string | null;
}

export interface FeedResponse {
    videos: VideoCardData[];
    nextCursor?: string;
}

// Prisma select for feed queries (uses denormalized fields)
const VIDEO_CARD_SELECT = {
    id: true,
    title: true,
    thumbnailUrl: true,
    previewSprite: true,
    duration: true,
    viewCount: true,
    publishedAt: true,
    channelId: true,
    channelName: true,
    channelImage: true,
    channelHandle: true,
} as const;

// Base where clause for all public feeds
const BASE_VIDEO_WHERE = {
    visibility: "PUBLIC" as const,
    processingStatus: "READY" as const,
    adminStatus: "NORMAL" as const,
    deletedAt: null,
    channels: {
        status: { not: "TERMINATED" as const },
        deletedAt: null,
    },
};

// =============================================================================
// HOME FEED
// =============================================================================

/**
 * Get personalized home feed
 * - Authenticated: Blend hotScore with user interest scores (50% personalization)
 * - Anonymous: Use global hotScore ranking
 */
export async function getHomeFeed(
    cursor?: string,
    limit = 24,
): Promise<ActionResponse<FeedResponse>> {
    try {
        const user = await getSessionUser();

        // Fetch more videos for re-ranking pool
        const fetchLimit = user ? limit * 4 : limit;

        const videos = await prisma.videos.findMany({
            where: BASE_VIDEO_WHERE,
            orderBy: { hotScore: "desc" },
            take: fetchLimit,
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            select: {
                ...VIDEO_CARD_SELECT,
                categoryId: true,
                hotScore: true,
            },
        });

        if (videos.length === 0) {
            return {
                success: true,
                data: { videos: [], nextCursor: undefined },
            };
        }

        // For anonymous users, return as-is
        if (!user) {
            const result = videos.slice(0, limit).map((v: any) => {
                const { categoryId, hotScore, ...rest } = v;
                return rest;
            });

            return {
                success: true,
                data: {
                    videos: result,
                    nextCursor:
                        result.length === limit
                            ? result[result.length - 1].id
                            : undefined,
                },
            };
        }

        // Fetch user's interests (channels and categories)
        const interests = await prisma.user_interests.findMany({
            where: {
                userId: user.id,
                score: { gt: 0.05 }, // Very low threshold to include any interest
            },
            select: {
                channelId: true,
                categoryId: true,
                score: true,
            },
        });

        // If no interests yet, return global ranking
        if (interests.length === 0) {
            const result = videos.slice(0, limit).map((v: any) => {
                const { categoryId, hotScore, ...rest } = v;
                return rest;
            });

            return {
                success: true,
                data: {
                    videos: result,
                    nextCursor:
                        result.length === limit
                            ? result[result.length - 1].id
                            : undefined,
                },
            };
        }

        // Build lookup maps
        const channelScores = new Map<string, number>();
        const categoryScores = new Map<string, number>();

        for (const interest of interests) {
            if (interest.channelId) {
                // Cap score at 1.0
                channelScores.set(
                    interest.channelId,
                    Math.min(1, interest.score),
                );
            }
            if (interest.categoryId) {
                categoryScores.set(
                    interest.categoryId,
                    Math.min(1, interest.score),
                );
            }
        }

        // Find max hotScore for normalization
        const maxHotScore = Math.max(
            ...videos.map((v: any) => v.hotScore || 0),
            1,
        );

        // Calculate personalized scores
        const personalizedVideos = videos.map((video: any) => {
            // Normalize hotScore to 0-1 range
            const normalizedGlobal = (video.hotScore || 0) / maxHotScore;

            // Interest scores (already 0-1)
            const channelBoost = channelScores.get(video.channelId) || 0;
            const categoryBoost = video.categoryId
                ? categoryScores.get(video.categoryId) || 0
                : 0;

            // Combined interest score (0-1)
            const interestScore = Math.min(
                1,
                channelBoost * 0.7 + categoryBoost * 0.3,
            );

            // STRONG personalization: 50% global quality + 50% user interest
            const personalizedScore =
                normalizedGlobal * 0.5 + interestScore * 0.5;

            return {
                ...video,
                personalizedScore,
                hasInterest: channelBoost > 0 || categoryBoost > 0,
            };
        });

        // Sort by personalized score
        personalizedVideos.sort(
            (a, b) => b.personalizedScore - a.personalizedScore,
        );

        // Mix in some diversity: ensure some non-interest videos in results
        const interested = personalizedVideos.filter((v: any) => v.hasInterest);
        const diverse = personalizedVideos.filter((v: any) => !v.hasInterest);

        // Take 70% from interests, 30% from diverse
        const interestCount = Math.min(
            Math.ceil(limit * 0.7),
            interested.length,
        );
        const diverseCount = limit - interestCount;

        const mixed = [
            ...interested.slice(0, interestCount),
            ...diverse.slice(0, diverseCount),
        ];

        // Re-sort mixed results
        mixed.sort((a, b) => b.personalizedScore - a.personalizedScore);

        const result = mixed.slice(0, limit).map((v: any) => {
            const {
                categoryId,
                hotScore,
                personalizedScore,
                hasInterest,
                ...rest
            } = v;
            return rest;
        });

        return {
            success: true,
            data: {
                videos: result,
                nextCursor:
                    result.length === limit
                        ? result[result.length - 1].id
                        : undefined,
            },
        };
    } catch (error) {
        console.error("[Feed] Home feed error:", error);
        return createErrorResponse("INTERNAL_ERROR", "Failed to load feed");
    }
}

// =============================================================================
// TRENDING
// =============================================================================

/**
 * Get trending videos ranked by trendingScore
 */
export async function getTrendingVideos(options?: {
    categoryId?: string;
    timeWindow?: "now" | "today" | "week";
    cursor?: string;
    limit?: number;
}): Promise<ActionResponse<FeedResponse>> {
    const limit = options?.limit || 50;

    // Time window filter
    const publishedAfter = {
        now: new Date(Date.now() - 4 * 60 * 60 * 1000), // 4 hours
        today: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours
        week: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days
    }[options?.timeWindow || "week"];

    try {
        const videos = await prisma.videos.findMany({
            where: {
                ...BASE_VIDEO_WHERE,
                publishedAt: { gte: publishedAfter },
                ...(options?.categoryId && { categoryId: options.categoryId }),
            },
            orderBy: { trendingScore: "desc" },
            take: limit,
            cursor: options?.cursor ? { id: options.cursor } : undefined,
            skip: options?.cursor ? 1 : 0,
            select: VIDEO_CARD_SELECT,
        });

        return {
            success: true,
            data: {
                videos,
                nextCursor:
                    videos.length === limit
                        ? videos[videos.length - 1].id
                        : undefined,
            },
        };
    } catch (error) {
        console.error("[Feed] Trending error:", error);
        return createErrorResponse("INTERNAL_ERROR", "Failed to load trending");
    }
}

// =============================================================================
// SUBSCRIPTION FEED
// =============================================================================

/**
 * Get latest videos from subscribed channels
 */
export async function getSubscriptionFeed(
    cursor?: string,
    limit = 24,
): Promise<ActionResponse<FeedResponse>> {
    const user = await getSessionUser();
    if (!user) {
        return createErrorResponse("UNAUTHORIZED", "Login required", 401);
    }

    try {
        // Get user's subscribed channel IDs
        const subscriptions = await prisma.subscriptions.findMany({
            where: { subscriberId: user.id },
            select: { channelId: true },
        });

        const channelIds = subscriptions.map((s: any) => s.channelId);

        if (channelIds.length === 0) {
            return {
                success: true,
                data: { videos: [], nextCursor: undefined },
            };
        }

        const videos = await prisma.videos.findMany({
            where: {
                channelId: { in: channelIds },
                visibility: "PUBLIC",
                processingStatus: "READY",
                adminStatus: "NORMAL",
                deletedAt: null,
            },
            orderBy: { publishedAt: "desc" },
            take: limit,
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            select: VIDEO_CARD_SELECT,
        });

        return {
            success: true,
            data: {
                videos,
                nextCursor:
                    videos.length === limit
                        ? videos[videos.length - 1].id
                        : undefined,
            },
        };
    } catch (error) {
        console.error("[Feed] Subscription error:", error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to load subscriptions",
        );
    }
}

// =============================================================================
// CONTINUE WATCHING
// =============================================================================

/**
 * Get incomplete videos from user's watch history
 */
export async function getContinueWatching(
    limit = 10,
): Promise<
    ActionResponse<FeedResponse & { watchProgress?: Record<string, number> }>
> {
    const user = await getSessionUser();
    if (!user) {
        return createErrorResponse("UNAUTHORIZED", "Login required", 401);
    }

    try {
        const history = await prisma.watch_history.findMany({
            where: {
                userId: user.id,
                completed: false,
                watchedSeconds: { gt: 30 }, // At least 30 seconds watched
                videos: {
                    visibility: "PUBLIC",
                    processingStatus: "READY",
                    adminStatus: "NORMAL",
                    deletedAt: null,
                },
            },
            orderBy: { lastWatchedAt: "desc" },
            take: limit,
            include: {
                videos: { select: VIDEO_CARD_SELECT },
            },
        });

        // Build progress map
        const watchProgress: Record<string, number> = {};
        for (const h of history) {
            if (h.videoDuration && h.videoDuration > 0) {
                watchProgress[h.videoId] = h.watchedSeconds / h.videoDuration;
            }
        }

        return {
            success: true,
            data: {
                videos: history.map((h: any) => h.videos),
                watchProgress,
                nextCursor: undefined, // No pagination for continue watching
            },
        };
    } catch (error) {
        console.error("[Feed] Continue watching error:", error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to load continue watching",
        );
    }
}

// =============================================================================
// WATCH HISTORY
// =============================================================================

export interface WatchHistoryResponse {
    videos: (VideoCardData & { watchedAt: Date; progress: number })[];
    nextCursor?: string;
}

/**
 * Get user's full watch history
 */
export async function getWatchHistory(
    cursor?: string,
    limit = 30,
): Promise<ActionResponse<WatchHistoryResponse>> {
    const user = await getSessionUser();
    if (!user) {
        return createErrorResponse("UNAUTHORIZED", "Login required", 401);
    }

    try {
        const history = await prisma.watch_history.findMany({
            where: {
                userId: user.id,
                videos: {
                    visibility: "PUBLIC",
                    processingStatus: "READY",
                    adminStatus: "NORMAL",
                    deletedAt: null,
                },
            },
            orderBy: { lastWatchedAt: "desc" },
            take: limit,
            cursor: cursor ? { id: cursor } : undefined,
            skip: cursor ? 1 : 0,
            include: {
                videos: { select: VIDEO_CARD_SELECT },
            },
        });

        const videos = history.map((h: any) => ({
            ...h.videos,
            watchedAt: h.lastWatchedAt,
            progress:
                h.videoDuration && h.videoDuration > 0
                    ? h.watchedSeconds / h.videoDuration
                    : 0,
        }));

        return {
            success: true,
            data: {
                videos,
                nextCursor:
                    history.length === limit
                        ? history[history.length - 1].id
                        : undefined,
            },
        };
    } catch (error) {
        console.error("[Feed] Watch history error:", error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to load watch history",
        );
    }
}

/**
 * Clear user's watch history
 */
export async function clearWatchHistory(): Promise<
    ActionResponse<{ deleted: number }>
> {
    const user = await getSessionUser();
    if (!user) {
        return createErrorResponse("UNAUTHORIZED", "Login required", 401);
    }

    try {
        const result = await prisma.watch_history.deleteMany({
            where: { userId: user.id },
        });

        return {
            success: true,
            data: { deleted: result.count },
        };
    } catch (error) {
        console.error("[Feed] Clear history error:", error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to clear watch history",
        );
    }
}

// =============================================================================
// CATEGORIES
// =============================================================================

/**
 * Get all video categories
 */
export async function getCategories() {
    try {
        const categories = await prisma.categories.findMany({
            orderBy: { sortOrder: "asc" },
            select: {
                id: true,
                name: true,
                slug: true,
                iconUrl: true,
            },
        });

        return { success: true, data: categories };
    } catch (error) {
        console.error("[Feed] Categories error:", error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to load categories",
        );
    }
}

// =============================================================================
// SEARCH
// =============================================================================

export interface SearchResult {
    videos: VideoCardData[];
    channels: {
        id: string;
        name: string;
        handle: string | null;
        avatarUrl: string | null;
        subscriberCount: number;
        videoCount: number;
    }[];
    nextCursor?: string;
}

/**
 * Search videos and channels
 */
export async function search(
    query: string,
    options?: {
        type?: "all" | "video" | "channel";
        cursor?: string;
        limit?: number;
        sortBy?: "relevance" | "date" | "views";
    },
): Promise<ActionResponse<SearchResult>> {
    const limit = options?.limit || 20;
    const searchType = options?.type || "all";
    const sortBy = options?.sortBy || "relevance";

    // Clean and prepare search query
    const cleanQuery = query.trim();
    if (!cleanQuery) {
        return {
            success: true,
            data: {
                videos: [],
                channels: [],
                nextCursor: undefined,
            },
        };
    }

    try {
        // Search videos
        let videos: VideoCardData[] = [];
        if (searchType === "all" || searchType === "video") {
            // Build order by clause
            const orderBy =
                sortBy === "date"
                    ? { publishedAt: "desc" as const }
                    : sortBy === "views"
                      ? { viewCount: "desc" as const }
                      : { hotScore: "desc" as const }; // relevance uses hotScore

            const videoResults = await prisma.videos.findMany({
                where: {
                    ...BASE_VIDEO_WHERE,
                    OR: [
                        {
                            title: {
                                contains: cleanQuery,
                                mode: "insensitive",
                            },
                        },
                        {
                            description: {
                                contains: cleanQuery,
                                mode: "insensitive",
                            },
                        },
                        {
                            channelName: {
                                contains: cleanQuery,
                                mode: "insensitive",
                            },
                        },
                    ],
                },
                orderBy,
                take: limit,
                cursor: options?.cursor ? { id: options.cursor } : undefined,
                skip: options?.cursor ? 1 : 0,
                select: VIDEO_CARD_SELECT,
            });

            videos = videoResults;
        }

        // Search channels
        let channels: SearchResult["channels"] = [];
        if (searchType === "all" || searchType === "channel") {
            const channelResults = await prisma.channels.findMany({
                where: {
                    status: "ACTIVE",
                    deletedAt: null,
                    OR: [
                        { name: { contains: cleanQuery, mode: "insensitive" } },
                        {
                            handle: {
                                contains: cleanQuery,
                                mode: "insensitive",
                            },
                        },
                        {
                            description: {
                                contains: cleanQuery,
                                mode: "insensitive",
                            },
                        },
                    ],
                },
                orderBy: { subscriberCount: "desc" },
                take: searchType === "channel" ? limit : 5, // Show fewer channels in mixed results
                select: {
                    id: true,
                    name: true,
                    handle: true,
                    image: true,
                    subscriberCount: true,
                    _count: {
                        select: { videos: true },
                    },
                },
            });

            channels = channelResults.map((c: any) => ({
                id: c.id,
                name: c.name,
                handle: c.handle,
                avatarUrl: c.image,
                subscriberCount: c.subscriberCount,
                videoCount: c._count.videos,
            }));
        }

        return {
            success: true,
            data: {
                videos,
                channels,
                nextCursor:
                    videos.length === limit
                        ? videos[videos.length - 1].id
                        : undefined,
            },
        };
    } catch (error) {
        console.error("[Feed] Search error:", error);
        return createErrorResponse("INTERNAL_ERROR", "Search failed");
    }
}
