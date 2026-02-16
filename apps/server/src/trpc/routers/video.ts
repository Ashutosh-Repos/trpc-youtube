import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { on } from "events";
import {
    router,
    protectedProcedure,
    videoOwnerProcedure,
    channelOwnerProcedure,
} from "../trpc";
import { TRPCError } from "@trpc/server";
import prisma from "../../lib/prisma";
import config from "../../config";
import {
    createMultipartUpload,
    getPresignedPartUrl,
    completeMultipartUpload,
    abortMultipartUpload,
    listUploadedParts,
} from "../../lib/storage";
import {
    cacheVideoStatus,
    cacheVideoMetadata,
    getVideoMetadata,
    deleteVideoMetadata,
    getCachedVideoStatus,
    REDIS_KEYS,
    VideoStatusEventSchema,
} from "../../lib/ws/definitions";
import { transcodeQueue, schedulerQueue, JOBS } from "../../queue/definitions";
import { redisSubscriptionManager } from "../../lib/ws/redisSubscription";
import * as path from "path";
import * as fs from "fs";
import { CompletedPart } from "@aws-sdk/client-s3";
import { Prisma } from "../../../generated/prisma/client";
import { updateChannelStats } from "../../lib/channels";

// --- Input Schemas ---

const initUploadSchema = z.object({
    fileName: z
        .string()
        .min(1)
        .max(255)
        .regex(
            /^[a-zA-Z0-9._\-\s]+$/,
            "Filename can only contain alphanumeric characters, dots, underscores, dashes, and spaces",
        ),
    channelId: z.string().min(1, { message: "Invalid Channel ID" }),
});

const getPartUrlSchema = z.object({
    videoId: z.string().min(1),
    uploadId: z.string().min(1),
    partNumber: z.number().int().min(1),
    md5: z.string().optional(),
});

const completeUploadSchema = z.object({
    videoId: z.string().min(1),
    uploadId: z.string().min(1),
    parts: z.array(
        z.object({
            ETag: z.string().min(1),
            PartNumber: z.number().int().min(1),
        }),
    ),
});

const videoIdSchema = z.object({
    videoId: z.string().min(1),
});

const abortUploadSchema = z.object({
    videoId: z.string().min(1),
    uploadId: z.string().min(1),
});

const reportFailureSchema = z.object({
    videoId: z.string().min(1),
    error: z.string().optional(),
});

/**
 * Updates the cached video count and total views for a channel.
 * Typically called after video publication, deletion, or visibility changes.
 */

// --- Router ---

export const videoRouter = router({
    /**
     * Initialize a multipart upload session and create video record
     */
    initUpload: protectedProcedure
        .input(
            initUploadSchema.extend({ idempotencyKey: z.string().optional() }),
        )
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.user.id;
            const { fileName, channelId, idempotencyKey } = input;

            // Verify channel exists and user owns it
            const channel = await prisma.channels.findUnique({
                where: { id: channelId },
                select: {
                    id: true,
                    handle: true,
                    name: true,
                    image: true,
                    status: true,
                    userId: true,
                },
            });

            if (!channel) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Channel not found",
                });
            }

            if (channel.userId !== userId) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message:
                        "You do not have permission to upload to this channel",
                });
            }

            // IDEMPOTENCY CHECK
            if (idempotencyKey) {
                const existingVideo = await prisma.videos.findUnique({
                    where: { idempotencyKey },
                    select: {
                        id: true,
                        uploadId: true,
                        processingStatus: true,
                        uploadExpiresAt: true,
                    },
                });

                if (existingVideo) {
                    // CASE 1: Valid Resumable Session
                    if (
                        existingVideo.processingStatus === "UPLOADING" &&
                        existingVideo.uploadId
                    ) {
                        // Check if not expired
                        if (
                            existingVideo.uploadExpiresAt &&
                            existingVideo.uploadExpiresAt > new Date()
                        ) {
                            console.log(
                                `[Pipeline] ♻️ Idempotency Hit: Returning existing session for ${fileName} (${existingVideo.id})`,
                            );

                            // Refresh cache just in case
                            await cacheVideoMetadata(existingVideo.id, {
                                uploadId: existingVideo.uploadId,
                                ownerId: userId,
                            });

                            const wsProtocol =
                                config.nodeEnv === "production" ? "wss" : "ws";
                            const wsUrl = config.publicWsUrl
                                ? `${config.publicWsUrl}/ws/videos?id=${existingVideo.id}`
                                : `${wsProtocol}://localhost:${config.port}/ws/videos?id=${existingVideo.id}`;

                            return {
                                videoId: existingVideo.id,
                                uploadId: existingVideo.uploadId,
                                wsUrl,
                                expiresAt:
                                    existingVideo.uploadExpiresAt.toISOString(),
                            };
                        }
                    }

                    // CASE 2: Completed/Processing Video (Conflict)
                    if (
                        existingVideo.processingStatus === "PROCESSING" ||
                        existingVideo.processingStatus === "READY"
                    ) {
                        throw new TRPCError({
                            code: "CONFLICT",
                            message:
                                "Duplicate Upload: The file you selected has already been uploaded to this channel. To upload it again, please delete the existing video from your content list.",
                        });
                    }

                    // CASE 3: Stale/Failed/Expired Session -> CLEANUP
                    // We must delete the old record to avoid unique constraint violation on 'idempotencyKey'
                    console.log(
                        `[Pipeline] 🗑️ Idempotency: Cleaning up stale/failed session for ${fileName} (${existingVideo.id})`,
                    );

                    if (existingVideo.uploadId) {
                        await abortMultipartUpload(
                            existingVideo.id,
                            existingVideo.uploadId,
                        ).catch((err) => {
                            console.warn(
                                `[Pipeline] ⚠️ Failed to abort stale upload session:`,
                                err,
                            );
                        });
                    }

                    await prisma.videos.delete({
                        where: { id: existingVideo.id },
                    });
                }
            }

            const uploadExpiresAt = new Date(
                Date.now() + config.upload.dbRecordExpiry * 1000,
            );

            console.log(
                `[Pipeline] 🆕 Initializing Multipart Upload for ${fileName} (Channel: ${channel.handle})`,
            );

            // 1. Start S3 session
            const videoId = uuidv4();
            const uploadId = await createMultipartUpload(videoId);

            // 2. Create DB record
            let video;
            try {
                video = await prisma.videos.create({
                    data: {
                        id: videoId,
                        uploadId,
                        channelId: channel.id,
                        title: fileName
                            .replace(/\.[^/.]+$/, "")
                            .substring(0, 100),
                        processingStatus: "UPLOADING",
                        visibility: "PRIVATE",
                        channelHandle: channel.handle,
                        channelName: channel.name,
                        channelImage: channel.image,
                        originalFileName: fileName,
                        uploadExpiresAt: uploadExpiresAt,
                        uploadStartedAt: new Date(),
                        uploadAttempts: 0,
                        updatedAt: new Date(),
                        idempotencyKey, // Save key
                    },
                    select: {
                        id: true,
                        title: true,
                        processingStatus: true,
                        createdAt: true,
                    },
                });
            } catch (error) {
                console.error(
                    `[Pipeline] ❌ DB Creation Failed. Aborting S3 Upload ${uploadId}...`,
                );
                await abortMultipartUpload(videoId, uploadId).catch((err) =>
                    console.error(
                        `[Pipeline] ⚠️ Failed to abort orphaned upload:`,
                        err,
                    ),
                );
                throw error;
            }

            // Cache initial status
            await cacheVideoStatus(video.id, {
                status: "UPLOADING",
                progress: 0,
            });

            // Cache metadata for subsequent calls
            await cacheVideoMetadata(videoId, {
                uploadId,
                ownerId: userId,
            });

            // Build WebSocket URL
            const wsProtocol = config.nodeEnv === "production" ? "wss" : "ws";
            const wsUrl = config.publicWsUrl
                ? `${config.publicWsUrl}/ws/videos?id=${video.id}`
                : `${wsProtocol}://localhost:${config.port}/ws/videos?id=${video.id}`;

            return {
                videoId: video.id,
                uploadId,
                wsUrl,
                expiresAt: uploadExpiresAt.toISOString(),
            };
        }),

    /**
     * Get a presigned URL for a specific part
     */
    getPartUrl: videoOwnerProcedure
        .input(
            getPartUrlSchema.omit({
                videoId: true,
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { video } = ctx;
            const { uploadId, partNumber, md5 } = input;

            if (video.uploadId !== uploadId) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Upload session mismatch",
                });
            }

            const url = await getPresignedPartUrl(
                video.id,
                uploadId,
                partNumber,
                md5,
            );

            return { url };
        }),

    /**
     * Get presigned URLs for multiple parts (Batch)
     */
    getPartUrls: videoOwnerProcedure
        .input(
            z.object({
                uploadId: z.string().min(1),
                parts: z
                    .array(
                        z.object({
                            partNumber: z.number().int().min(1),
                            md5: z.string().optional(),
                        }),
                    )
                    .min(1)
                    .max(50), // Batch limit
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { video } = ctx;
            const { uploadId, parts } = input;

            if (video.uploadId !== uploadId) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Upload session mismatch",
                });
            }

            const urls = await Promise.all(
                parts.map(async (part) => {
                    const url = await getPresignedPartUrl(
                        video.id,
                        uploadId,
                        part.partNumber,
                        part.md5,
                    );
                    return { partNumber: part.partNumber, url };
                }),
            );

            return { urls };
        }),

    /**
     * Resume an interrupted upload
     */
    resumeUpload: videoOwnerProcedure.query(async ({ ctx }) => {
        const { video } = ctx;

        if (!video.uploadId) {
            throw new TRPCError({
                code: "BAD_REQUEST",
                message: "No active upload session",
            });
        }

        console.log(
            `[Pipeline] 🔄 Resuming Multipart Upload for ${video.id}...`,
        );

        const parts = await listUploadedParts(video.id, video.uploadId);

        const wsProtocol = config.nodeEnv === "production" ? "wss" : "ws";
        const wsUrl = config.publicWsUrl
            ? `${config.publicWsUrl}/ws/videos?id=${video.id}`
            : `${wsProtocol}://localhost:${config.port}/ws/videos?id=${video.id}`;

        return {
            videoId: video.id,
            uploadId: video.uploadId,
            wsUrl,
            parts: parts.map((p) => ({
                PartNumber: p.PartNumber,
                ETag: p.ETag,
            })),
        };
    }),

    /**
     * Complete the multipart upload
     */
    completeUpload: videoOwnerProcedure
        .input(completeUploadSchema.omit({ videoId: true }))
        .mutation(async ({ ctx, input }) => {
            const { video } = ctx;
            const { uploadId, parts } = input;

            if (video.uploadId !== uploadId) {
                // If the video is already processing or ready, this might be a retry.
                // We should check if the uploadId mismatches because it was already cleared/completed.
                if (
                    video.processingStatus === "PROCESSING" ||
                    video.processingStatus === "READY"
                ) {
                    console.log(
                        `[Pipeline] ⚠️ completeUpload called for ${video.id} which is already ${video.processingStatus}. Treating as success.`,
                    );
                    return {
                        success: true,
                        message: "Upload already completed",
                    };
                }

                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Upload session mismatch",
                });
            }

            console.log(
                `[Pipeline] 🏁 Completing Multipart Upload for ${video.id}...`,
            );

            // Verify all parts have ETags
            const missingETags = parts.filter((p) => !p.ETag);
            if (missingETags.length > 0) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "Some parts are missing ETags. Upload failed.",
                });
            }

            try {
                await completeMultipartUpload(
                    video.id,
                    uploadId,
                    parts as CompletedPart[],
                );
            } catch (error: any) {
                // S3 Error Handling & Recovery
                if (error.name === "NoSuchUpload") {
                    console.warn(
                        `[Pipeline] ⚠️ NoSuchUpload for ${video.id}. Checking if duplicate or already completed...`,
                    );

                    // 1. Check DB (Fastest) - Already handled above, but double check fresh state
                    const freshVideo = await prisma.videos.findUnique({
                        where: { id: video.id },
                        select: {
                            processingStatus: true,
                            uploadCompletedAt: true,
                        },
                    });

                    if (
                        freshVideo?.processingStatus === "PROCESSING" ||
                        freshVideo?.uploadCompletedAt
                    ) {
                        console.log(
                            `[Pipeline] ✅ DB says upload already completed. Returning success.`,
                        );
                        return {
                            success: true,
                            message: "Upload already completed",
                        };
                    }

                    // 2. Check S3 Object Existence (Source of Truth)
                    // If S3 merge succeeded but DB update failed previously, the upload ID is gone, but the file exists.
                    try {
                        const { headObject } =
                            await import("../../lib/storage");
                        const exists = await headObject(
                            `raw-videos/${video.id}/source`,
                        );

                        if (exists) {
                            console.log(
                                `[Pipeline] ✅ Object exists in S3 despite NoSuchUpload error. Treating as success (Recovered).`,
                            );

                            // Fix DB State
                            await prisma.videos.update({
                                where: { id: video.id },
                                data: {
                                    uploadCompletedAt: new Date(),
                                    processingStatus: "PROCESSING",
                                },
                            });

                            // Trigger Transcode (since we recovered, we must ensure downstream works)
                            try {
                                const { JOBS } =
                                    await import("../../queue/definitions");
                                await transcodeQueue.add(
                                    JOBS.PROBE_AND_SPLIT,
                                    {
                                        videoId: video.id,
                                        fileName: `raw-videos/${video.id}/source`,
                                    },
                                    { jobId: video.id },
                                );
                            } catch {}

                            return {
                                success: true,
                                message: "Upload recovered and completed",
                            };
                        }
                    } catch (headErr) {
                        console.warn(
                            `[Pipeline] ❌ Recovery failed: Object not found in S3.`,
                            headErr,
                        );
                    }
                }
                throw error;
            }

            // Update DB
            await prisma.videos.update({
                where: { id: video.id },
                data: {
                    uploadCompletedAt: new Date(),
                    processingStatus: "PROCESSING",
                },
            });

            try {
                const { JOBS } = await import("../../queue/definitions");

                const key = `raw-videos/${video.id}/source`;

                console.log(
                    `[Pipeline] 🚀 Triggering Transcode Job for ${video.id} (Key: ${key})`,
                );

                await transcodeQueue.add(
                    JOBS.PROBE_AND_SPLIT,
                    {
                        videoId: video.id,
                        fileName: key,
                    },
                    { jobId: video.id },
                );
            } catch (error) {
                console.warn(
                    `[Pipeline] ⚠️ Failed to trigger job explicitly (relying on MinIO event):`,
                    error,
                );
            }

            return { success: true, message: "Upload completion initiated" };
        }),

    /**
     * Abort a multipart upload
     */
    abortUpload: videoOwnerProcedure
        .input(abortUploadSchema.omit({ videoId: true }))
        .mutation(async ({ ctx, input }) => {
            const { video } = ctx;
            const { uploadId } = input;

            console.log(
                `[Pipeline] 🛑 Aborting Multipart Upload for ${video.id}...`,
            );

            await abortMultipartUpload(video.id, uploadId);

            // Remove from queue if present
            try {
                const job = await transcodeQueue.getJob(video.id);
                if (job) {
                    await job.remove();
                    console.log(
                        `[Pipeline] 🗑️ Removed pending job for ${video.id}`,
                    );
                }

                // Clean local cache
                const cacheDir = path.join(config.tempDir, video.id);
                if (fs.existsSync(cacheDir)) {
                    fs.rmSync(cacheDir, { recursive: true, force: true });
                    console.log(
                        `[Pipeline] 🧹 Cleaned local input cache for ${video.id}`,
                    );
                }
            } catch (e) {
                console.warn(
                    `[Pipeline] ⚠️ Failed to remove job or cache during abort:`,
                    e,
                );
            }

            // Delete record
            await prisma.videos.delete({ where: { id: video.id } });

            // Clear cache
            await deleteVideoMetadata(video.id);

            return {
                success: true,
                message: "Upload aborted and record removed",
            };
        }),

    /**
     * Report a client-side upload failure
     */
    reportFailure: videoOwnerProcedure
        .input(reportFailureSchema.omit({ videoId: true }))
        .mutation(async ({ ctx, input }) => {
            const { video } = ctx;
            const { error } = input;

            await prisma.videos.update({
                where: { id: video.id },
                data: {
                    processingStatus: "FAILED",
                    processingError: error || "Client-side upload failed",
                },
            });

            console.log(
                `[Pipeline] ❌ Upload for ${video.id} reported as FAILED`,
            );

            return { success: true, message: "Video status updated to FAILED" };
        }),

    /**
     * Get current processing status
     */
    getStatus: videoOwnerProcedure.query(async ({ ctx }) => {
        const { video } = ctx;

        // Return cached status
        const status = await getCachedVideoStatus(video.id);

        if (status) {
            return status;
        }

        return {
            status: video.processingStatus,
            progress: video.processingProgress || 0,
            error: video.processingError || undefined,
            hlsUrl: video.hlsPlaylistUrl || undefined,
            thumbnails: video.thumbnailOptions || undefined,
        };
    }),

    /**
     * Subscribe to processing status updates
     */
    onProcessingStatus: videoOwnerProcedure.subscription(async function* ({
        ctx,
    }) {
        const { video } = ctx;
        const channel = REDIS_KEYS.videoWsChannel(video.id);

        try {
            for await (const [rawMessage] of on(
                redisSubscriptionManager,
                channel,
            )) {
                // Runtime Validation: Ensure message matches schema
                const result = VideoStatusEventSchema.safeParse(rawMessage);

                if (!result.success) {
                    console.warn(
                        `[TRPC] ⚠️ Invalid Redis message on ${channel}:`,
                        result.error,
                    );
                    continue;
                }

                const data = result.data;
                yield data;

                if (data.status === "READY" || data.status === "FAILED") {
                    break; // Closes iterator, removing listener
                }
            }
        } catch (err) {
            // Handle aborts or errors
        }
    }),

    // ─── Studio Content Management ───────────────────────────────────

    /**
     * Fetch channel content (videos/shorts) with cursor-based pagination and filters.
     * Used by Studio Content page.
     */
    getChannelContent: channelOwnerProcedure
        .input(
            z.object({
                channelId: z.string(),
                visibility: z
                    .enum(["PUBLIC", "PRIVATE", "UNLISTED", "SCHEDULED"])
                    .optional(),
                search: z.string().optional(),
                isShort: z.boolean().optional(),
                isAgeRestricted: z.boolean().optional(),
                limit: z.number().min(1).max(100).default(30),
                cursor: z.string().optional(),
                sortOrder: z
                    .enum(["newest", "oldest", "views"])
                    .default("newest"),
            }),
        )
        .query(async ({ ctx, input }) => {
            const {
                visibility,
                search,
                isShort,
                isAgeRestricted,
                limit,
                cursor,
                sortOrder,
            } = input;
            const channelId = ctx.channel.id;

            const where: Prisma.videosWhereInput = {
                channelId,
                deletedAt: null,
                ...(visibility && { visibility }),
                ...(typeof isShort === "boolean" && { isShort }),
                ...(typeof isAgeRestricted === "boolean" && {
                    isAgeRestricted,
                }),
                ...(search && {
                    OR: [
                        { title: { contains: search, mode: "insensitive" } },
                        {
                            description: {
                                contains: search,
                                mode: "insensitive",
                            },
                        },
                    ],
                }),
            };

            const [items, totalCount] = await Promise.all([
                prisma.videos.findMany({
                    where,
                    take: limit + 1,
                    cursor: cursor ? { id: cursor } : undefined,
                    skip: cursor ? 1 : 0,
                    orderBy: [
                        sortOrder === "views"
                            ? { viewCount: "desc" }
                            : sortOrder === "oldest"
                              ? { createdAt: "asc" }
                              : { createdAt: "desc" },
                        { id: "desc" }, // Deterministic tie-breaker
                    ],
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

            return { items, nextCursor, totalCount };
        }),

    /**
     * Bulk soft-delete videos.
     * Ownership enforced via channelOwnerProcedure — only deletes videos belonging to the channel.
     */
    deleteVideos: channelOwnerProcedure
        .input(
            z.object({
                channelId: z.string(),
                videoIds: z.array(z.string()).min(1).max(100),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const channelId = ctx.channel.id;
            const { videoIds } = input;

            // Only delete videos that belong to this channel
            const result = await prisma.videos.updateMany({
                where: {
                    id: { in: videoIds },
                    channelId,
                    deletedAt: null,
                },
                data: { deletedAt: new Date() },
            });

            // Update channel stats
            await updateChannelStats(channelId);

            // Remove any scheduled jobs
            try {
                await Promise.all(
                    videoIds.map((id) => schedulerQueue.remove(id)),
                );
            } catch (err) {
                console.warn(
                    `[Video] ⚠️ Failed to remove scheduled jobs for deleted videos:`,
                    err,
                );
            }

            return { success: true, count: result.count };
        }),

    /**
     * Bulk update video visibility.
     * Resets scheduledAt for non-SCHEDULED visibility values.
     */
    updateVideosVisibility: channelOwnerProcedure
        .input(
            z.object({
                channelId: z.string(),
                videoIds: z.array(z.string()).min(1).max(100),
                visibility: z.enum(["PUBLIC", "PRIVATE", "UNLISTED"]),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const channelId = ctx.channel.id;
            const { videoIds, visibility } = input;

            const result = await prisma.videos.updateMany({
                where: {
                    id: { in: videoIds },
                    channelId,
                },
                data: {
                    visibility,
                    scheduledAt: null,
                },
            });

            // Update channel stats
            await updateChannelStats(channelId);

            return { success: true, count: result.count };
        }),

    /**
     * Get single video details for editing.
     * Includes tags, category, and chapters.
     */
    getVideo: videoOwnerProcedure.query(async ({ ctx }) => {
        const { video } = ctx;

        const videoDetails = await prisma.videos.findUnique({
            where: { id: video.id },
            include: {
                tags: true,
                category: true,
                chapters: {
                    orderBy: { startTime: "asc" },
                },
            },
        });

        if (!videoDetails) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "Video not found",
            });
        }

        return videoDetails;
    }),

    /**
     * Update video metadata.
     * Handles title, description, visibility, scheduling, tags, category, and chapters.
     */
    updateVideo: videoOwnerProcedure
        .input(
            z
                .object({
                    title: z.string().min(1).max(100).optional(),
                    description: z.string().max(5000).optional(),
                    visibility: z
                        .enum(["PUBLIC", "PRIVATE", "UNLISTED", "SCHEDULED"])
                        .optional(),
                    scheduledAt: z.date().nullable().optional(),
                    categoryId: z.string().nullable().optional(),
                    tags: z.array(z.string()).optional(),
                    chapters: z
                        .array(
                            z.object({
                                title: z.string(),
                                startTime: z.number(),
                            }),
                        )
                        .optional(),
                    thumbnailUrl: z.string().optional(),
                    isAgeRestricted: z.boolean().optional(),
                    allowComments: z.boolean().optional(),
                    allowEmbedding: z.boolean().optional(),
                })
                .refine(
                    (data) => {
                        if (data.visibility === "SCHEDULED") {
                            return data.scheduledAt != null;
                        }
                        return true;
                    },
                    {
                        message:
                            "Schedule date is required when visibility is scheduled",
                        path: ["scheduledAt"],
                    },
                ),
        )
        .mutation(async ({ ctx, input }) => {
            const { video } = ctx;
            const { videoId, tags, chapters, ...otherData } = input;

            // Sanitize scheduling: clear scheduledAt if not visibility SCHEDULED
            if (otherData.visibility && otherData.visibility !== "SCHEDULED") {
                otherData.scheduledAt = null;
            }

            const updatedVideo = await prisma.videos.update({
                where: { id: video.id },
                data: {
                    ...otherData,
                    ...(tags && {
                        tags: {
                            set: [], // Disconnect all existing tags
                            connectOrCreate: tags.map((tag) => ({
                                where: { name: tag.trim() },
                                create: { name: tag.trim() },
                            })),
                        },
                    }),
                    ...(chapters && {
                        chapters: {
                            deleteMany: {}, // Delete all existing chapters
                            create: chapters.map((c) => ({
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

            // If visibility changed, update channel stats
            if (
                otherData.visibility &&
                otherData.visibility !== video.visibility
            ) {
                await updateChannelStats(video.channelId);
            }

            // HANDLE SCHEDULING
            // Always try to remove existing job to handle rescheduling or cancellation
            if (
                otherData.visibility !== undefined ||
                otherData.scheduledAt !== undefined
            ) {
                try {
                    await schedulerQueue.remove(video.id);

                    if (
                        updatedVideo.visibility === "SCHEDULED" &&
                        updatedVideo.scheduledAt
                    ) {
                        const delay =
                            updatedVideo.scheduledAt.getTime() - Date.now();

                        if (delay > 0) {
                            console.log(
                                `[Video] 🕰️ Scheduling video ${video.id} publish in ${Math.round(delay / 1000)}s`,
                            );
                            await schedulerQueue.add(
                                JOBS.PUBLISH_SCHEDULED_VIDEO,
                                { videoId: video.id },
                                {
                                    delay,
                                    jobId: video.id, // Enforce unique job ID per video
                                    removeOnComplete: true,
                                },
                            );
                        } else {
                            console.warn(
                                `[Video] ⚠️ Scheduled time is in the past. Video will remain SCHEDULED until worker picks it up or user updates.`,
                            );
                            // Optionally triggered immediately?
                            // The worker *should* handle past jobs if we add with 0 delay,
                            // but let's just add it with 0 delay to be safe.
                            await schedulerQueue.add(
                                JOBS.PUBLISH_SCHEDULED_VIDEO,
                                { videoId: video.id },
                                {
                                    jobId: video.id,
                                    removeOnComplete: true,
                                },
                            );
                        }
                    } else {
                        console.log(
                            `[Video] 🗑️ Removed scheduled job for ${video.id} (Visibility: ${updatedVideo.visibility})`,
                        );
                    }
                } catch (err) {
                    console.error(
                        `[Video] ❌ Failed to manage scheduler job for ${video.id}:`,
                        err,
                    );
                    // Non-critical: don't fail the request, but log loud
                }
            }

            return updatedVideo;
        }),
});
