import { prisma } from "../lib/prisma";
import { z } from "zod";
import { TRPCError } from "@trpc/server";

export const feedCursorSchema = z.number().min(0).default(0);
export type FeedCursor = z.infer<typeof feedCursorSchema>;

export interface HydratedVideo {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    previewSprite: string | null;
    channelId: string;
    channels: {
        id: string;
        name: string | null;
        handle: string | null;
        image: string | null;
        subscriberCount?: number;
    };
    viewCount: number;
    createdAt: Date | string;
    duration: number | null;
    isPremiere?: boolean;
    isAgeRestricted?: boolean;
    isShort: boolean;
}

/** Shape of a row returned by the raw SQL feed queries. */
interface RawFeedRow {
    id: string;
    title: string;
    thumbnailUrl: string | null;
    previewSprite: string | null;
    channelId: string;
    channelName: string | null;
    channelHandle: string | null;
    channelImage: string | null;
    channelSubscriberCount: number | null;
    viewCount: number;
    createdAt: Date | string;
    duration: number | null;
    isShort: boolean;
}

export class FeedService {
    private static PAGE_SIZE = 20;

    /**
     * Get Personalized Home Feed (SQL Computed Score) - Long Form Only
     */
    public static async getHomeFeed(
        userId: string | undefined,
        cursor: FeedCursor = 0,
    ): Promise<{
        videos: HydratedVideo[];
        nextCursor: FeedCursor | undefined;
    }> {
        try {
            const limit = this.PAGE_SIZE;
            let videos: RawFeedRow[];

            if (userId) {
                // 1. Personalized Feed: Candidate Retrieval + LOG10 Squashed Affinities
                videos = await prisma.$queryRaw`
                    WITH user_cats AS (
                        SELECT "categoryId", MAX(score + (COALESCE("watchTime", 0) / 360.0)) as affinity 
                        FROM user_interests 
                        WHERE "userId" = ${userId} AND "categoryId" IS NOT NULL
                        GROUP BY "categoryId"
                    ),
                    user_chans AS (
                        SELECT "channelId", MAX(score + (COALESCE("watchTime", 0) / 360.0)) as affinity 
                        FROM user_interests 
                        WHERE "userId" = ${userId} AND "channelId" IS NOT NULL
                        GROUP BY "channelId"
                    ),
                    -- Candidate Retrieval Pipeline (Solves O(N) Table Scans)
                    candidate_pool AS (
                        -- 500 Globally Hot (Long form only)
                        (SELECT id FROM videos WHERE visibility = 'PUBLIC' AND "processingStatus" = 'READY' AND "deletedAt" IS NULL AND "isShort" = false ORDER BY "hotScore" DESC LIMIT 500)
                        UNION
                        -- 200 Chronologically Fresh (Long form only)
                        (SELECT id FROM videos WHERE visibility = 'PUBLIC' AND "processingStatus" = 'READY' AND "deletedAt" IS NULL AND "isShort" = false ORDER BY "publishedAt" DESC NULLS LAST LIMIT 200)
                        UNION
                        -- 500 User Category Matches
                        (
                            SELECT v.id FROM videos v 
                            INNER JOIN user_cats uc ON v."categoryId" = uc."categoryId"
                            WHERE v.visibility = 'PUBLIC' AND v."processingStatus" = 'READY' AND v."deletedAt" IS NULL AND v."isShort" = false AND uc.affinity > 1.0
                            ORDER BY v."hotScore" DESC LIMIT 500
                        )
                    )
                    SELECT 
                        v.id,
                        v.title,
                        v."thumbnailUrl",
                        v."previewSprite",
                        v."channelId",
                        c.name as "channelName",
                        c.handle as "channelHandle",
                        c.image as "channelImage",
                        c."subscriberCount" as "channelSubscriberCount",
                        v."viewCount",
                        v."createdAt",
                        v.duration,
                        v."isShort",
                        (
                            -- Base algorithmic score
                            v."hotScore" + 
                            -- Freshness Bonus: Max +5.0 decay over 120h (5 days).
                            GREATEST(0.0, 5.0 - (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(v."publishedAt", v."createdAt")))/3600.0 / 24.0))
                        ) * (1.0 + LOG10(1.0 + COALESCE(uc.affinity, 0.0) + COALESCE(uch.affinity, 0.0))) as "personalizedScore"
                    FROM videos v
                    INNER JOIN candidate_pool cp ON v.id = cp.id
                    INNER JOIN channels c ON v."channelId" = c.id
                    LEFT JOIN user_cats uc ON v."categoryId" = uc."categoryId"
                    LEFT JOIN user_chans uch ON v."channelId" = uch."channelId"
                    ORDER BY "personalizedScore" DESC, v.id ASC
                    LIMIT ${limit} OFFSET ${cursor};
                `;
            } else {
                // 2. Anonymous Feed: Global HotScore + Freshness Bonus only
                videos = await prisma.$queryRaw`
                    WITH candidate_pool AS (
                        (SELECT id FROM videos WHERE visibility = 'PUBLIC' AND "processingStatus" = 'READY' AND "deletedAt" IS NULL AND "isShort" = false ORDER BY "hotScore" DESC LIMIT 500)
                        UNION
                        (SELECT id FROM videos WHERE visibility = 'PUBLIC' AND "processingStatus" = 'READY' AND "deletedAt" IS NULL AND "isShort" = false ORDER BY "publishedAt" DESC NULLS LAST LIMIT 200)
                    )
                    SELECT 
                        v.id,
                        v.title,
                        v."thumbnailUrl",
                        v."previewSprite",
                        v."channelId",
                        c.name as "channelName",
                        c.handle as "channelHandle",
                        c.image as "channelImage",
                        c."subscriberCount" as "channelSubscriberCount",
                        v."viewCount",
                        v."createdAt",
                        v.duration,
                        v."isShort",
                        (
                            v."hotScore" + 
                            GREATEST(0.0, 5.0 - (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(v."publishedAt", v."createdAt")))/3600.0 / 24.0))
                        ) as "personalizedScore"
                    FROM videos v
                    INNER JOIN candidate_pool cp ON v.id = cp.id
                    INNER JOIN channels c ON v."channelId" = c.id
                    ORDER BY "personalizedScore" DESC, v.id ASC
                    LIMIT ${limit} OFFSET ${cursor};
                `;
            }

            return this.formatResponse(videos, cursor, limit);
        } catch (error) {
            console.error("[FeedService] getHomeFeed failed", error);
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch home feed",
            });
        }
    }

    /**
     * Get Trending Feed - Long Form Only
     */
    public static async getTrendingFeed(
        userId: string | undefined,
        cursor: FeedCursor = 0,
    ): Promise<{
        videos: HydratedVideo[];
        nextCursor: FeedCursor | undefined;
    }> {
        try {
            const limit = this.PAGE_SIZE;
            let videos: any[];

            if (userId) {
                // Personalized Trending: Overlays LOG10 Personalization Multiplier atop Trending Velocity Metric
                videos = await prisma.$queryRaw`
                    WITH user_cats AS (
                        SELECT "categoryId", MAX(score + (COALESCE("watchTime", 0) / 360.0)) as affinity 
                        FROM user_interests 
                        WHERE "userId" = ${userId} AND "categoryId" IS NOT NULL
                        GROUP BY "categoryId"
                    ),
                    user_chans AS (
                        SELECT "channelId", MAX(score + (COALESCE("watchTime", 0) / 360.0)) as affinity 
                        FROM user_interests 
                        WHERE "userId" = ${userId} AND "channelId" IS NOT NULL
                        GROUP BY "channelId"
                    ),
                    candidate_pool AS (
                        SELECT id FROM videos 
                        WHERE visibility = 'PUBLIC' AND "processingStatus" = 'READY' AND "deletedAt" IS NULL AND "trendingScore" > 0 AND "isShort" = false
                        ORDER BY "trendingScore" DESC LIMIT 500
                    )
                    SELECT 
                        v.id,
                        v.title,
                        v."thumbnailUrl",
                        v."previewSprite",
                        v."channelId",
                        c.name as "channelName",
                        c.handle as "channelHandle",
                        c.image as "channelImage",
                        c."subscriberCount" as "channelSubscriberCount",
                        v."viewCount",
                        v."createdAt",
                        v.duration,
                        v."isShort",
                        (
                            v."trendingScore" + 
                            GREATEST(0.0, 5.0 - (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(v."publishedAt", v."createdAt")))/3600.0 / 24.0))
                        ) * (1.0 + LOG10(1.0 + COALESCE(uc.affinity, 0.0) + COALESCE(uch.affinity, 0.0))) as "personalizedTrendingScore"
                    FROM videos v
                    INNER JOIN candidate_pool cp ON v.id = cp.id
                    INNER JOIN channels c ON v."channelId" = c.id
                    LEFT JOIN user_cats uc ON v."categoryId" = uc."categoryId"
                    LEFT JOIN user_chans uch ON v."channelId" = uch."channelId"
                    ORDER BY "personalizedTrendingScore" DESC, v.id ASC
                    LIMIT ${limit} OFFSET ${cursor};
                `;
            } else {
                // Anonymous Trending
                videos = await prisma.$queryRaw`
                    WITH candidate_pool AS (
                        SELECT id FROM videos 
                        WHERE visibility = 'PUBLIC' AND "processingStatus" = 'READY' AND "deletedAt" IS NULL AND "trendingScore" > 0 AND "isShort" = false
                        ORDER BY "trendingScore" DESC LIMIT 500
                    )
                    SELECT 
                        v.id,
                        v.title,
                        v."thumbnailUrl",
                        v."previewSprite",
                        v."channelId",
                        c.name as "channelName",
                        c.handle as "channelHandle",
                        c.image as "channelImage",
                        c."subscriberCount" as "channelSubscriberCount",
                        v."viewCount",
                        v."createdAt",
                        v.duration,
                        v."isShort",
                        (
                            v."trendingScore" + 
                            GREATEST(0.0, 5.0 - (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(v."publishedAt", v."createdAt")))/3600.0 / 24.0))
                        ) as "personalizedTrendingScore"
                    FROM videos v
                    INNER JOIN candidate_pool cp ON v.id = cp.id
                    INNER JOIN channels c ON v."channelId" = c.id
                    ORDER BY "personalizedTrendingScore" DESC, v.id ASC
                    LIMIT ${limit} OFFSET ${cursor};
                `;
            }

            return this.formatResponse(videos, cursor, limit);
        } catch (error) {
            console.error("[FeedService] getTrendingFeed failed", error);
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch trending feed",
            });
        }
    }

    /**
     * Get Personalized Home Shorts Feed (SQL Computed Score) - Shorts Only
     */
    public static async getHomeShorts(
        userId: string | undefined,
        cursor: FeedCursor = 0,
    ): Promise<{
        videos: HydratedVideo[];
        nextCursor: FeedCursor | undefined;
    }> {
        try {
            const limit = 15; // Shorts shelves usually fetch 15 at a time
            let videos: any[];

            if (userId) {
                videos = await prisma.$queryRaw`
                    WITH user_cats AS (
                        SELECT "categoryId", MAX(score + (COALESCE("watchTime", 0) / 360.0)) as affinity 
                        FROM user_interests 
                        WHERE "userId" = ${userId} AND "categoryId" IS NOT NULL
                        GROUP BY "categoryId"
                    ),
                    user_chans AS (
                        SELECT "channelId", MAX(score + (COALESCE("watchTime", 0) / 360.0)) as affinity 
                        FROM user_interests 
                        WHERE "userId" = ${userId} AND "channelId" IS NOT NULL
                        GROUP BY "channelId"
                    ),
                    candidate_pool AS (
                        (SELECT id FROM videos WHERE visibility = 'PUBLIC' AND "processingStatus" = 'READY' AND "deletedAt" IS NULL AND "isShort" = true ORDER BY "hotScore" DESC LIMIT 500)
                        UNION
                        (SELECT id FROM videos WHERE visibility = 'PUBLIC' AND "processingStatus" = 'READY' AND "deletedAt" IS NULL AND "isShort" = true ORDER BY "publishedAt" DESC NULLS LAST LIMIT 200)
                        UNION
                        (
                            SELECT v.id FROM videos v 
                            INNER JOIN user_cats uc ON v."categoryId" = uc."categoryId"
                            WHERE v.visibility = 'PUBLIC' AND v."processingStatus" = 'READY' AND v."deletedAt" IS NULL AND v."isShort" = true AND uc.affinity > 1.0
                            ORDER BY v."hotScore" DESC LIMIT 500
                        )
                    )
                    SELECT 
                        v.id,
                        v.title,
                        v."thumbnailUrl",
                        v."previewSprite",
                        v."channelId",
                        c.name as "channelName",
                        c.handle as "channelHandle",
                        c.image as "channelImage",
                        c."subscriberCount" as "channelSubscriberCount",
                        v."viewCount",
                        v."createdAt",
                        v.duration,
                        v."isShort",
                        (
                            v."hotScore" + 
                            GREATEST(0.0, 5.0 - (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(v."publishedAt", v."createdAt")))/3600.0 / 24.0))
                        ) * (1.0 + LOG10(1.0 + COALESCE(uc.affinity, 0.0) + COALESCE(uch.affinity, 0.0))) as "personalizedScore"
                    FROM videos v
                    INNER JOIN candidate_pool cp ON v.id = cp.id
                    INNER JOIN channels c ON v."channelId" = c.id
                    LEFT JOIN user_cats uc ON v."categoryId" = uc."categoryId"
                    LEFT JOIN user_chans uch ON v."channelId" = uch."channelId"
                    ORDER BY "personalizedScore" DESC, v.id ASC
                    LIMIT ${limit} OFFSET ${cursor};
                `;
            } else {
                videos = await prisma.$queryRaw`
                    WITH candidate_pool AS (
                        (SELECT id FROM videos WHERE visibility = 'PUBLIC' AND "processingStatus" = 'READY' AND "deletedAt" IS NULL AND "isShort" = true ORDER BY "hotScore" DESC LIMIT 500)
                        UNION
                        (SELECT id FROM videos WHERE visibility = 'PUBLIC' AND "processingStatus" = 'READY' AND "deletedAt" IS NULL AND "isShort" = true ORDER BY "publishedAt" DESC NULLS LAST LIMIT 200)
                    )
                    SELECT 
                        v.id,
                        v.title,
                        v."thumbnailUrl",
                        v."previewSprite",
                        v."channelId",
                        c.name as "channelName",
                        c.handle as "channelHandle",
                        c.image as "channelImage",
                        c."subscriberCount" as "channelSubscriberCount",
                        v."viewCount",
                        v."createdAt",
                        v.duration,
                        v."isShort",
                        (
                            v."hotScore" + 
                            GREATEST(0.0, 5.0 - (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(v."publishedAt", v."createdAt")))/3600.0 / 24.0))
                        ) as "personalizedScore"
                    FROM videos v
                    INNER JOIN candidate_pool cp ON v.id = cp.id
                    INNER JOIN channels c ON v."channelId" = c.id
                    ORDER BY "personalizedScore" DESC, v.id ASC
                    LIMIT ${limit} OFFSET ${cursor};
                `;
            }

            return this.formatResponse(videos, cursor, limit);
        } catch (error) {
            console.error("[FeedService] getHomeShorts failed", error);
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch home shorts",
            });
        }
    }

    /**
     * Get Trending Shorts Feed
     */
    public static async getTrendingShorts(
        userId: string | undefined,
        cursor: FeedCursor = 0,
    ): Promise<{
        videos: HydratedVideo[];
        nextCursor: FeedCursor | undefined;
    }> {
        try {
            const limit = 15;
            let videos: any[];

            if (userId) {
                videos = await prisma.$queryRaw`
                    WITH user_cats AS (
                        SELECT "categoryId", MAX(score + (COALESCE("watchTime", 0) / 360.0)) as affinity 
                        FROM user_interests 
                        WHERE "userId" = ${userId} AND "categoryId" IS NOT NULL
                        GROUP BY "categoryId"
                    ),
                    user_chans AS (
                        SELECT "channelId", MAX(score + (COALESCE("watchTime", 0) / 360.0)) as affinity 
                        FROM user_interests 
                        WHERE "userId" = ${userId} AND "channelId" IS NOT NULL
                        GROUP BY "channelId"
                    ),
                    candidate_pool AS (
                        SELECT id FROM videos 
                        WHERE visibility = 'PUBLIC' AND "processingStatus" = 'READY' AND "deletedAt" IS NULL AND "trendingScore" > 0 AND "isShort" = true
                        ORDER BY "trendingScore" DESC LIMIT 500
                    )
                    SELECT 
                        v.id,
                        v.title,
                        v."thumbnailUrl",
                        v."previewSprite",
                        v."channelId",
                        c.name as "channelName",
                        c.handle as "channelHandle",
                        c.image as "channelImage",
                        c."subscriberCount" as "channelSubscriberCount",
                        v."viewCount",
                        v."createdAt",
                        v.duration,
                        v."isShort",
                        (
                            v."trendingScore" + 
                            GREATEST(0.0, 5.0 - (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(v."publishedAt", v."createdAt")))/3600.0 / 24.0))
                        ) * (1.0 + LOG10(1.0 + COALESCE(uc.affinity, 0.0) + COALESCE(uch.affinity, 0.0))) as "personalizedTrendingScore"
                    FROM videos v
                    INNER JOIN candidate_pool cp ON v.id = cp.id
                    INNER JOIN channels c ON v."channelId" = c.id
                    LEFT JOIN user_cats uc ON v."categoryId" = uc."categoryId"
                    LEFT JOIN user_chans uch ON v."channelId" = uch."channelId"
                    ORDER BY "personalizedTrendingScore" DESC, v.id ASC
                    LIMIT ${limit} OFFSET ${cursor};
                `;
            } else {
                videos = await prisma.$queryRaw`
                    WITH candidate_pool AS (
                        SELECT id FROM videos 
                        WHERE visibility = 'PUBLIC' AND "processingStatus" = 'READY' AND "deletedAt" IS NULL AND "trendingScore" > 0 AND "isShort" = true
                        ORDER BY "trendingScore" DESC LIMIT 500
                    )
                    SELECT 
                        v.id,
                        v.title,
                        v."thumbnailUrl",
                        v."previewSprite",
                        v."channelId",
                        c.name as "channelName",
                        c.handle as "channelHandle",
                        c.image as "channelImage",
                        c."subscriberCount" as "channelSubscriberCount",
                        v."viewCount",
                        v."createdAt",
                        v.duration,
                        v."isShort",
                        (
                            v."trendingScore" + 
                            GREATEST(0.0, 5.0 - (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(v."publishedAt", v."createdAt")))/3600.0 / 24.0))
                        ) as "personalizedTrendingScore"
                    FROM videos v
                    INNER JOIN candidate_pool cp ON v.id = cp.id
                    INNER JOIN channels c ON v."channelId" = c.id
                    ORDER BY "personalizedTrendingScore" DESC, v.id ASC
                    LIMIT ${limit} OFFSET ${cursor};
                `;
            }

            return this.formatResponse(videos, cursor, limit);
        } catch (error) {
            console.error("[FeedService] getTrendingShorts failed", error);
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch trending shorts",
            });
        }
    }

    /**
     * Get Public Videos for a Channel (paginated, newest first)
     */
    public static async getChannelVideos(
        channelId: string,
        cursor: FeedCursor = 0,
    ): Promise<{
        videos: HydratedVideo[];
        nextCursor: FeedCursor | undefined;
    }> {
        try {
            const limit = this.PAGE_SIZE;
            const videos: any[] = await prisma.$queryRaw`
                SELECT 
                    v.id,
                    v.title,
                    v."thumbnailUrl",
                    v."previewSprite",
                    v."channelId",
                    c.name as "channelName",
                    c.handle as "channelHandle",
                    c.image as "channelImage",
                    c."subscriberCount" as "channelSubscriberCount",
                    v."viewCount",
                    v."createdAt",
                    v.duration,
                    v."isShort"
                FROM videos v
                INNER JOIN channels c ON v."channelId" = c.id
                WHERE v."channelId" = ${channelId}
                  AND v.visibility = 'PUBLIC'
                  AND v."processingStatus" = 'READY'
                  AND v."isShort" = false
                  AND v."deletedAt" IS NULL
                ORDER BY COALESCE(v."publishedAt", v."createdAt") DESC, v.id ASC
                LIMIT ${limit} OFFSET ${cursor};
            `;
            return this.formatResponse(videos, cursor, limit);
        } catch (error) {
            console.error("[FeedService] getChannelVideos failed", error);
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch channel videos",
            });
        }
    }

    /**
     * Get Public Shorts for a Channel (paginated, newest first)
     */
    public static async getChannelShorts(
        channelId: string,
        cursor: FeedCursor = 0,
    ): Promise<{
        videos: HydratedVideo[];
        nextCursor: FeedCursor | undefined;
    }> {
        try {
            const limit = this.PAGE_SIZE;
            const videos: any[] = await prisma.$queryRaw`
                SELECT 
                    v.id,
                    v.title,
                    v."thumbnailUrl",
                    v."previewSprite",
                    v."channelId",
                    c.name as "channelName",
                    c.handle as "channelHandle",
                    c.image as "channelImage",
                    c."subscriberCount" as "channelSubscriberCount",
                    v."viewCount",
                    v."createdAt",
                    v.duration,
                    v."isShort"
                FROM videos v
                INNER JOIN channels c ON v."channelId" = c.id
                WHERE v."channelId" = ${channelId}
                  AND v.visibility = 'PUBLIC'
                  AND v."processingStatus" = 'READY'
                  AND v."isShort" = true
                  AND v."deletedAt" IS NULL
                ORDER BY COALESCE(v."publishedAt", v."createdAt") DESC, v.id ASC
                LIMIT ${limit} OFFSET ${cursor};
            `;
            return this.formatResponse(videos, cursor, limit);
        } catch (error) {
            console.error("[FeedService] getChannelShorts failed", error);
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch channel shorts",
            });
        }
    }

    /**
     * Get Up Next Recommendations
     * Weighted heavily towards the same category and channel.
     */
    public static async getRecommendations(
        videoId: string,
        userId: string | undefined,
        cursor: FeedCursor = 0,
    ): Promise<{
        videos: HydratedVideo[];
        nextCursor: FeedCursor | undefined;
    }> {
        try {
            const limit = this.PAGE_SIZE;

            // 1. Fetch source video contexts
            const sourceVideo = await prisma.videos.findUnique({
                where: { id: videoId },
                select: { categoryId: true, channelId: true, isShort: true },
            });

            if (!sourceVideo) {
                return { videos: [], nextCursor: undefined };
            }

            const isShort = sourceVideo.isShort || false;

            // 2. Fetch candidates via Native SQL
            let videos: any[];

            if (userId) {
                // Personalized related query
                videos = await prisma.$queryRaw`
                    WITH user_cats AS (
                        SELECT "categoryId", MAX(score + (COALESCE("watchTime", 0) / 360.0)) as affinity 
                        FROM user_interests 
                        WHERE "userId" = ${userId} AND "categoryId" IS NOT NULL
                        GROUP BY "categoryId"
                    ),
                    user_chans AS (
                        SELECT "channelId", MAX(score + (COALESCE("watchTime", 0) / 360.0)) as affinity 
                        FROM user_interests 
                        WHERE "userId" = ${userId} AND "channelId" IS NOT NULL
                        GROUP BY "channelId"
                    ),
                    source_tags AS (
                        SELECT "A" as tag_id FROM "_TagToVideo" WHERE "B" = ${videoId}
                    ),
                    candidate_pool AS (
                        SELECT id FROM videos 
                        WHERE visibility = 'PUBLIC' 
                          AND "processingStatus" = 'READY' 
                          AND "isShort" = ${isShort}
                          AND id != ${videoId}
                        ORDER BY 
                          CASE WHEN "categoryId" = ${sourceVideo.categoryId} THEN 2 ELSE 0 END +
                          CASE WHEN "channelId" = ${sourceVideo.channelId} THEN 1 ELSE 0 END DESC,
                          "hotScore" DESC 
                        LIMIT 500
                    ),
                    candidate_tags AS (
                        SELECT tv."B" as video_id, COUNT(tv."A") as tag_match_count
                        FROM "_TagToVideo" tv
                        JOIN source_tags st ON tv."A" = st.tag_id
                        JOIN candidate_pool cp ON tv."B" = cp.id
                        GROUP BY tv."B"
                    )
                    SELECT 
                        v.id,
                        v.title,
                        v."thumbnailUrl",
                        v."previewSprite",
                        v."channelId",
                        c.name as "channelName",
                        c.handle as "channelHandle",
                        c.image as "channelImage",
                        c."subscriberCount" as "channelSubscriberCount",
                        v."viewCount",
                        v."createdAt",
                        v.duration,
                        v."isShort",
                        (
                            v."hotScore" + 
                            CASE WHEN v."categoryId" = ${sourceVideo.categoryId} THEN 20.0 ELSE 0.0 END +
                            CASE WHEN v."channelId" = ${sourceVideo.channelId} THEN 10.0 ELSE 0.0 END +
                            (COALESCE(ct.tag_match_count, 0) * 5.0) +
                            GREATEST(0.0, 5.0 - (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(v."publishedAt", v."createdAt")))/3600.0 / 24.0))
                        ) * (1.0 + LOG10(1.0 + COALESCE(uc.affinity, 0.0) + COALESCE(uch.affinity, 0.0))) as "recommendationScore"
                    FROM videos v
                    INNER JOIN candidate_pool cp ON v.id = cp.id
                    INNER JOIN channels c ON v."channelId" = c.id
                    LEFT JOIN user_cats uc ON v."categoryId" = uc."categoryId"
                    LEFT JOIN user_chans uch ON v."channelId" = uch."channelId"
                    LEFT JOIN candidate_tags ct ON v.id = ct.video_id
                    ORDER BY "recommendationScore" DESC, v.id ASC
                    LIMIT ${limit} OFFSET ${cursor};
                `;
            } else {
                // Anonymous related query
                videos = await prisma.$queryRaw`
                    WITH source_tags AS (
                        SELECT "A" as tag_id FROM "_TagToVideo" WHERE "B" = ${videoId}
                    ),
                    candidate_pool AS (
                        SELECT id FROM videos 
                        WHERE visibility = 'PUBLIC' 
                          AND "processingStatus" = 'READY' 
                          AND "isShort" = ${isShort}
                          AND id != ${videoId}
                        ORDER BY 
                          CASE WHEN "categoryId" = ${sourceVideo.categoryId} THEN 2 ELSE 0 END +
                          CASE WHEN "channelId" = ${sourceVideo.channelId} THEN 1 ELSE 0 END DESC,
                          "hotScore" DESC 
                        LIMIT 500
                    ),
                    candidate_tags AS (
                        SELECT tv."B" as video_id, COUNT(tv."A") as tag_match_count
                        FROM "_TagToVideo" tv
                        JOIN source_tags st ON tv."A" = st.tag_id
                        JOIN candidate_pool cp ON tv."B" = cp.id
                        GROUP BY tv."B"
                    )
                    SELECT 
                        v.id,
                        v.title,
                        v."thumbnailUrl",
                        v."previewSprite",
                        v."channelId",
                        c.name as "channelName",
                        c.handle as "channelHandle",
                        c.image as "channelImage",
                        c."subscriberCount" as "channelSubscriberCount",
                        v."viewCount",
                        v."createdAt",
                        v.duration,
                        v."isShort",
                        (
                            v."hotScore" + 
                            CASE WHEN v."categoryId" = ${sourceVideo.categoryId} THEN 20.0 ELSE 0.0 END +
                            CASE WHEN v."channelId" = ${sourceVideo.channelId} THEN 10.0 ELSE 0.0 END +
                            (COALESCE(ct.tag_match_count, 0) * 5.0) +
                            GREATEST(0.0, 5.0 - (EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE(v."publishedAt", v."createdAt")))/3600.0 / 24.0))
                        ) as "recommendationScore"
                    FROM videos v
                    INNER JOIN candidate_pool cp ON v.id = cp.id
                    INNER JOIN channels c ON v."channelId" = c.id
                    LEFT JOIN candidate_tags ct ON v.id = ct.video_id
                    ORDER BY "recommendationScore" DESC, v.id ASC
                    LIMIT ${limit} OFFSET ${cursor};
                `;
            }

            return this.formatResponse(videos, cursor, limit);
        } catch (error) {
            console.error("[FeedService] getRecommendations failed", error);
            throw new TRPCError({
                code: "INTERNAL_SERVER_ERROR",
                message: "Failed to fetch recommendations",
            });
        }
    }

    private static formatResponse(
        videos: any[],
        cursor: number,
        limit: number,
    ) {
        const formattedVideos = videos.map((v) => ({
            id: v.id,
            title: v.title,
            thumbnailUrl: v.thumbnailUrl,
            previewSprite: v.previewSprite || null,
            channelId: v.channelId,
            channels: {
                id: v.channelId,
                name: v.channelName || null,
                handle: v.channelHandle || null,
                image: v.channelImage || null,
                subscriberCount: v.channelSubscriberCount || 0,
            },
            viewCount: v.viewCount,
            createdAt:
                v.createdAt instanceof Date
                    ? v.createdAt.toISOString()
                    : v.createdAt,
            duration: v.duration,
            isShort: v.isShort || false,
        }));

        let nextCursor: number | undefined = cursor + videos.length;
        if (videos.length < limit) {
            nextCursor = undefined;
        }

        return { videos: formattedVideos, nextCursor };
    }
}
