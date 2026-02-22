"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
    ActionResponse,
    videoContentFilterSchema,
    VideoContentFilterInput,
    createErrorResponse,
} from "./schema-types";
import { getSessionUser } from "./user";

/**
 * Fetch channel content (Videos, Shorts) with advanced filtering and pagination
 */
export async function getChannelContent(
    channelId: string,
    filters: VideoContentFilterInput,
): Promise<
    ActionResponse<{
        items: any[];
        nextCursor: string | null;
        totalCount: number;
    }>
> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return {
                success: false,
                error: {
                    code: "UNAUTHORIZED",
                    message: "Login required",
                    status: 401,
                },
            };
        }

        const validFilters = videoContentFilterSchema.parse(filters);
        const {
            visibility,
            search,
            isShort,
            isAgeRestricted,
            limit,
            cursor,
            sortOrder,
        } = validFilters;

        // 1. Verify ownership
        const channel = await prisma.channels.findUnique({
            where: { id: channelId },
            select: { userId: true },
        });

        if (!channel || channel.userId !== user.id) {
            return createErrorResponse("FORBIDDEN", "Access denied", 403);
        }

        // 2. Build Query
        const where: any = {
            channelId,
            deletedAt: null,
            ...(visibility && { visibility }),
            ...(typeof isShort === "boolean" && { isShort }),
            ...(typeof isAgeRestricted === "boolean" && { isAgeRestricted }),
            ...(search && {
                OR: [
                    { title: { contains: search, mode: "insensitive" } },
                    { description: { contains: search, mode: "insensitive" } },
                ],
            }),
        };

        // 3. Execute
        const [items, totalCount] = await Promise.all([
            prisma.videos.findMany({
                where,
                take: limit + 1, // Peek for next cursor
                cursor: cursor ? { id: cursor } : undefined,
                skip: cursor ? 1 : 0,
                orderBy:
                    sortOrder === "views"
                        ? { viewCount: "desc" }
                        : sortOrder === "oldest"
                          ? { createdAt: "asc" }
                          : { createdAt: "desc" },
                select: {
                    id: true,
                    title: true,
                    description: true,
                    thumbnailUrl: true,
                    duration: true,
                    visibility: true,
                    adminStatus: true,
                    adminNote: true,
                    processingStatus: true,
                    processingProgress: true,
                    resolutions: true,
                    viewCount: true,
                    likeCount: true,
                    commentCount: true,
                    createdAt: true,
                    publishedAt: true,
                    scheduledAt: true,
                    isShort: true,
                    channelId: true,
                    previewSprite: true,
                    previewSpriteVtt: true,
                },
            }),
            prisma.videos.count({ where }),
        ]);

        let nextCursor: string | null = null;
        if (items.length > limit) {
            const nextItem = items.pop();
            nextCursor = nextItem!.id;
        }

        const safeData = JSON.parse(
            JSON.stringify({ items, nextCursor, totalCount }),
        );
        return { success: true, data: safeData };
    } catch (error) {
        console.error(`[Video Management] getChannelContent failed:`, error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            error instanceof Error ? error.message : "Failed to fetch content",
        );
    }
}

/**
 * Toggle video visibility in-place
 */
export async function updateVideoVisibility(
    videoId: string,
    visibility: "PUBLIC" | "PRIVATE" | "UNLISTED" | "SCHEDULED",
    scheduledAt?: Date,
): Promise<ActionResponse<{ id: string; visibility: string }>> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return {
                success: false,
                error: {
                    code: "UNAUTHORIZED",
                    message: "Login required",
                    status: 401,
                },
            };
        }

        // Permission check
        const video = await prisma.videos.findUnique({
            where: { id: videoId },
            select: { channels: { select: { userId: true, id: true } } },
        });

        if (!video || video.channels.userId !== user.id) {
            return {
                success: false,
                error: {
                    code: "FORBIDDEN",
                    message: "Access denied",
                    status: 403,
                },
            };
        }

        const updated = await prisma.videos.update({
            where: { id: videoId },
            data: {
                visibility,
                scheduledAt: visibility === "SCHEDULED" ? scheduledAt : null,
                publishedAt: visibility === "PUBLIC" ? new Date() : undefined,
            },
            select: { id: true, visibility: true },
        });

        revalidatePath(`/studio/${video.channels.id}/content`);
        revalidatePath(`/studio/${video.channels.id}/content/video/${videoId}`);

        return { success: true, data: JSON.parse(JSON.stringify(updated)) };
    } catch (error) {
        console.error(
            `[Video Management] updateVideoVisibility failed:`,
            error,
        );
        return createErrorResponse(
            "INTERNAL_ERROR",
            error instanceof Error
                ? error.message
                : "Failed to update visibility",
        );
    }
}

/**
 * Fetch a single video by ID with ownership check
 */
export async function getVideoById(
    videoId: string,
): Promise<ActionResponse<any>> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return {
                success: false,
                error: {
                    code: "UNAUTHORIZED",
                    message: "Login required",
                    status: 401,
                },
            };
        }

        const video = await prisma.videos.findUnique({
            where: { id: videoId, deletedAt: null },
            include: {
                // Added 'include' block
                channels: {
                    select: {
                        id: true,
                        userId: true,
                        name: true,
                        handle: true,
                    },
                },
                tags: true,
                chapters: {
                    orderBy: { startTime: "asc" },
                },
            },
        });

        if (!video) {
            return createErrorResponse("NOT_FOUND", "Video not found", 404);
        }

        if (video.channels.userId !== user.id) {
            return {
                success: false,
                error: {
                    code: "FORBIDDEN",
                    message: "Access denied",
                    status: 403,
                },
            };
        }

        return { success: true, data: JSON.parse(JSON.stringify(video)) };
    } catch (error) {
        console.error(`[Video Management] getVideoById failed:`, error);
        return {
            success: false,
            error: {
                code: "INTERNAL_ERROR",
                message: "Failed to fetch video",
            },
        };
    }
}

const updateVideoSchema = z.object({
    title: z.string().min(1, "Title is required").max(100).optional(),
    description: z.string().max(5000).optional(),
    isAgeRestricted: z.boolean().optional(),
    thumbnailUrl: z.string().optional().or(z.literal("")),
    tags: z.array(z.string()).default([]),
    categoryId: z.string().nullable(),
    allowComments: z.boolean().default(true),
    allowEmbedding: z.boolean().default(true),
    language: z.string().nullable().optional(),
    visibility: z
        .enum(["PUBLIC", "PRIVATE", "UNLISTED", "SCHEDULED"])
        .optional(),
    scheduledAt: z.date().nullable().optional(),
    chapters: z
        .array(
            z.object({
                title: z.string(),
                startTime: z.number(),
            }),
        )
        .optional(),
});

/**
 * Update video metadata
 */
export async function updateVideoMetadata(
    videoId: string,
    data: z.infer<typeof updateVideoSchema>,
): Promise<ActionResponse<any>> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return {
                success: false,
                error: {
                    code: "UNAUTHORIZED",
                    message: "Login required",
                    status: 401,
                },
            };
        }

        // Permission check
        const video = await prisma.videos.findUnique({
            where: { id: videoId },
            select: { channels: { select: { userId: true, id: true } } },
        });

        if (!video || video.channels.userId !== user.id) {
            return {
                success: false,
                error: {
                    code: "FORBIDDEN",
                    message: "Access denied",
                    status: 403,
                },
            };
        }

        const validatedData = updateVideoSchema.parse(data);

        // Sanitize scheduling: clear scheduledAt if not visibility SCHEDULED
        if (
            validatedData.visibility &&
            validatedData.visibility !== "SCHEDULED"
        ) {
            validatedData.scheduledAt = null;
        }

        const { tags, chapters, ...otherData } = validatedData;

        const updated = await prisma.videos.update({
            where: { id: videoId },
            data: {
                ...otherData,
                ...(tags && {
                    tags: {
                        set: [], // Clear existing
                        connectOrCreate: (tags as string[]).map(
                            (tag: string) => ({
                                where: { name: tag.trim() },
                                create: { name: tag.trim() },
                            }),
                        ),
                    },
                }),
                ...(chapters && {
                    chapters: {
                        deleteMany: {},
                        create: chapters.map((c: any) => ({
                            title: c.title,
                            startTime: c.startTime,
                        })),
                    },
                }),
            },
            include: {
                tags: true,
                category: true,
                chapters: {
                    orderBy: { startTime: "asc" },
                },
            },
        });

        revalidatePath(`/studio/${video.channels.id}/content`);
        revalidatePath(`/studio/${video.channels.id}/content/video/${videoId}`);

        return { success: true, data: JSON.parse(JSON.stringify(updated)) };
    } catch (error) {
        console.error(`[Video Management] updateVideoMetadata failed:`, error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            error instanceof Error
                ? error.message
                : "Failed to update metadata",
        );
    }
}
/**
 * Soft delete a video
 */
export async function deleteVideo(
    videoId: string,
): Promise<ActionResponse<{ id: string }>> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return {
                success: false,
                error: {
                    code: "UNAUTHORIZED",
                    message: "Login required",
                    status: 401,
                },
            };
        }

        // Permission check
        const video = await prisma.videos.findUnique({
            where: { id: videoId },
            select: { channels: { select: { userId: true, id: true } } },
        });

        if (!video || video.channels.userId !== user.id) {
            return {
                success: false,
                error: {
                    code: "FORBIDDEN",
                    message: "Access denied",
                    status: 403,
                },
            };
        }

        await prisma.videos.update({
            where: { id: videoId },
            data: { deletedAt: new Date() },
        });

        revalidatePath(`/studio/${video.channels.id}/content`);

        return { success: true, data: { id: videoId } };
    } catch (error) {
        console.error(`[Video Management] deleteVideo failed:`, error);
        return createErrorResponse("INTERNAL_ERROR", "Failed to delete video");
    }
}

/**
 * Fetch all categories
 */
export async function getCategories() {
    try {
        const categories = await prisma.categories.findMany({
            orderBy: { name: "asc" },
        });
        return { success: true, data: categories };
    } catch (error) {
        return createErrorResponse(
            "SERVER_ERROR",
            "Failed to fetch categories",
        );
    }
}
/**
 * Bulk soft delete videos
 */
export async function deleteVideos(
    videoIds: string[],
): Promise<ActionResponse<{ count: number }>> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return {
                success: false,
                error: { code: "UNAUTHORIZED", message: "Login required" },
            };
        }

        // Verify ownership for all
        const videos = await prisma.videos.findMany({
            where: { id: { in: videoIds } },
            select: {
                id: true,
                channelId: true,
                channels: { select: { userId: true } },
            },
        });

        const unauthorized = videos.some((v) => v.channels.userId !== user.id);
        if (unauthorized || videos.length !== videoIds.length) {
            return {
                success: false,
                error: {
                    code: "FORBIDDEN",
                    message: "Ownership verification failed",
                },
            };
        }

        await prisma.videos.updateMany({
            where: { id: { in: videoIds } },
            data: { deletedAt: new Date() },
        });

        if (videos[0]?.channelId) {
            revalidatePath(`/studio/${videos[0].channelId}/content`);
        }
        revalidatePath(`/studio`);

        return { success: true, data: { count: videoIds.length } };
    } catch (error) {
        return createErrorResponse("INTERNAL_ERROR", "Bulk delete failed");
    }
}

/**
 * Bulk update video visibility
 */
export async function updateVideosVisibility(
    videoIds: string[],
    visibility: "PUBLIC" | "PRIVATE" | "UNLISTED",
): Promise<ActionResponse<{ count: number }>> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return {
                success: false,
                error: { code: "UNAUTHORIZED", message: "Login required" },
            };
        }

        // Verify ownership
        const videos = await prisma.videos.findMany({
            where: { id: { in: videoIds } },
            select: { id: true, channels: { select: { userId: true } } },
        });

        const unauthorized = videos.some((v) => v.channels.userId !== user.id);
        if (unauthorized || videos.length !== videoIds.length) {
            return {
                success: false,
                error: {
                    code: "FORBIDDEN",
                    message: "Ownership verification failed",
                },
            };
        }

        await prisma.videos.updateMany({
            where: { id: { in: videoIds } },
            data: {
                visibility,
                scheduledAt: null, // Reset scheduling for bulk moves
            },
        });

        // Get one video to find channelId for precise revalidation
        const refVideo = await prisma.videos.findUnique({
            where: { id: videoIds[0] },
            select: { channelId: true },
        });

        if (refVideo) {
            revalidatePath(`/studio/${refVideo.channelId}/content`);
        }
        revalidatePath(`/studio`);

        return { success: true, data: { count: videoIds.length } };
    } catch (error) {
        return createErrorResponse("INTERNAL_ERROR", "Bulk update failed");
    }
}
