import { Worker, Job } from "bullmq";
import { QUEUES, JOBS } from "./definitions";
import { getRedisConnection } from "../lib/redis";
import redis from "../lib/redis";
import prisma from "../lib/prisma";
import config from "../config";
import { updateChannelStats } from "../lib/channels";

export let schedulerWorker: Worker;

export const setupSchedulerWorker = () => {
    schedulerWorker = new Worker(
        QUEUES.SCHEDULER,
        async (job: Job) => {
            console.log(
                `[Scheduler] 🕰️ Job ${job.name} started (ID: ${job.id}) - Data: ${JSON.stringify(job.data)}`,
            );

            try {
                if (job.name === JOBS.PUBLISH_SCHEDULED_VIDEO) {
                    await handlePublishScheduledVideo(job);
                } else {
                    throw new Error(`Unknown job type: ${job.name}`);
                }
            } catch (error) {
                console.error(`❌ Scheduler Job ${job.name} failed:`, error);
                throw error;
            }
        },
        {
            connection: getRedisConnection(),
            concurrency: 5, // Low concurrency needed for lightweight DB updates
            removeOnComplete: { count: 100, age: 3600 * 24 }, // Keep history for 24h
            removeOnFail: { count: 100, age: 3600 * 24 * 7 }, // Keep failures longer
        },
    );

    schedulerWorker.on("ready", () => {
        console.log(`[Scheduler] 🟢 Worker is ready`);
    });

    schedulerWorker.on("error", (err) => {
        console.error(`[Scheduler] 🔴 Worker Error:`, err);
    });

    schedulerWorker.on("completed", (job) => {
        console.log(`[Scheduler] ✅ Job ${job.id} completed!`);
    });

    console.log(`👷 Scheduler Worker started on queue: ${QUEUES.SCHEDULER}`);
    return schedulerWorker;
};

async function handlePublishScheduledVideo(job: Job) {
    const { videoId } = job.data;

    console.log(`[Scheduler] 🚀 Publishing scheduled video: ${videoId}`);

    // IDEMPOTENCY & VALIDATION CHECK
    const video = await prisma.videos.findUnique({
        where: { id: videoId },
        select: {
            id: true,
            visibility: true,
            scheduledAt: true,
            processingStatus: true,
        },
    });

    if (!video) {
        console.warn(`[Scheduler] ⚠️ Video ${videoId} not found. Skipping.`);
        return;
    }

    // SAFEGUARD: Do not publish if processing failed
    if (video.processingStatus === "FAILED") {
        console.warn(
            `[Scheduler] ⚠️ Video ${videoId} is in FAILED state. Skipping publish.`,
        );
        return;
    }

    if (video.visibility !== "SCHEDULED") {
        console.warn(
            `[Scheduler] ⚠️ Video ${videoId} is no longer SCHEDULED (Current: ${video.visibility}). Skipping.`,
        );
        return;
    }

    if (!video.scheduledAt) {
        console.warn(
            `[Scheduler] ⚠️ Video ${videoId} has no scheduled date. Skipping.`,
        );
        return;
    }

    // OPTIMISTIC CONCURRENCY UPDATE
    // Ensure we only update if the video is STILL scheduled.
    // This prevents race conditions where a user might have concurrently changed settings.
    const result = await prisma.videos.updateMany({
        where: {
            id: videoId,
            visibility: "SCHEDULED",
            // CRITICAL: Prevent race condition where user rescheduled to future
            // while this job was starting. Only publish if time is reached/passed.
            scheduledAt: {
                lte: new Date(),
            },
        },
        data: {
            visibility: "PUBLIC",
            publishedAt: new Date(),
            scheduledAt: null, // Clear schedule
        },
    });

    if (result.count === 0) {
        console.warn(
            `[Scheduler] ⚠️ Update skipped for ${videoId}. Video state may have changed concurrently.`,
        );
        return;
    }

    console.log(`[Scheduler] ✅ Video ${videoId} status updated to PUBLIC.`);

    // Update Channel Stats
    const channelId = (
        await prisma.videos.findUnique({
            where: { id: videoId },
            select: { channelId: true },
        })
    )?.channelId;

    if (channelId) {
        // Reuse shared logic for consistency
        await updateChannelStats(channelId);
    }

    // Notify Clients & Cache (Non-blocking / Best-effort)
    try {
        const { publishToVideoChannel, cacheVideoMetadata } =
            await import("../lib/ws/definitions");

        // Cache updated visibility
        await cacheVideoMetadata(videoId, {
            visibility: "PUBLIC",
        });

        await publishToVideoChannel(videoId, {
            type: "update",
            visibility: "PUBLIC",
            publishedAt: new Date(),
        });
    } catch (err) {
        console.error(
            `[Scheduler] ⚠️ Failed to send WS notification for ${videoId}:`,
            err,
        );
        // Do not throw; DB update was successful.
    }

    // NEW_VIDEO notification: fan out to all subscribers
    if (channelId) {
        try {
            const videoData = await prisma.videos.findUnique({
                where: { id: videoId },
                select: {
                    title: true,
                    thumbnailUrl: true,
                    channels: { select: { name: true, handle: true } },
                },
            });

            if (videoData) {
                await redis.xadd(
                    "queue:new-video-notifications",
                    "*",
                    "data",
                    JSON.stringify({
                        channelId,
                        videoId,
                        title: videoData.title,
                        thumbnailUrl: videoData.thumbnailUrl,
                        channelName: videoData.channels.name,
                        channelHandle: videoData.channels.handle,
                    }),
                );
            }
        } catch (err) {
            console.error(
                `[Scheduler] ⚠️ Failed to queue NEW_VIDEO for ${videoId}:`,
                err,
            );
        }
    }

    console.log(`[Scheduler] 🎉 Job finished for ${videoId}`);
}
