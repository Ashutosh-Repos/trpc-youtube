import { execSync } from "child_process";
try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    console.log("✅ FFmpeg binary found");
} catch (error) {
    console.error("❌ FFmpeg binary NOT found in PATH. Please install ffmpeg.");
    process.exit(1);
}
import { Worker, Job } from "bullmq";
import { QUEUES, JOBS } from "./definitions";
import {
    downloadFile,
    uploadFile,
    ensureDir,
    deleteS3Prefix,
} from "../lib/storage";

import config from "../config";
import {
    probeVideo,
    transcodeResolution,
    generateThumbnails,
    createMasterPlaylist,
    generatePreviewSprite,
} from "../lib/ffmpeg";
import * as path from "path";
import * as fs from "fs";
import { addTranscodeFlow } from "./flow";
import { ensureOriginalFile } from "../lib/inputCache";

import { transcodeQueue } from "./definitions";

// Temporary scratch space - configurable for horizontal scaling
const getTempDir = () => config.tempDir;

import redis, { getRedisConnection, redisUrl } from "../lib/redis";
import prisma from "../lib/prisma";
export let worker: Worker;

export const setupWorker = () => {
    worker = new Worker(
        QUEUES.TRANSCODE,
        async (job: Job) => {
            console.log(
                `[Pipeline] 👷 Job ${job.name} started (ID: ${job.id}) - Data: ${JSON.stringify(job.data)}`,
            );

            try {
                switch (job.name) {
                    case JOBS.PROBE_AND_SPLIT:
                        return await handleProbeAndSplit(job);
                    case JOBS.TRANSCODE_CHUNK:
                        return await handleTranscodeChunk(job);
                    case JOBS.GENERATE_THUMBNAILS:
                        return await handleThumbnails(job);
                    case JOBS.GENERATE_SPRITE:
                        return await handleGenerateSprite(job);
                    case JOBS.MERGE_MANIFEST:
                        return await handleMergeManifest(job);
                    case JOBS.CONTENT_MODERATION:
                        return await handleContentModeration(job);
                    default:
                        throw new Error(`Unknown job type: ${job.name}`);
                }
            } catch (error) {
                console.error(`❌ Job ${job.name} failed:`, error);
                throw error;
            }
        },
        {
            connection: getRedisConnection(),
            concurrency: config.queue.concurrency,
            lockDuration: config.jobLockDurationMs, // Configurable for large files
            maxStalledCount: 2,
        },
    );

    // Cleanup Listener: Remove temp files and S3 artifacts on FINAL failure
    worker.on("failed", async (job, err) => {
        if (job && job.data && job.data.videoId) {
            const videoId = job.data.videoId;
            // Check if we have exhausted retries
            const maxAttempts = job.opts.attempts || 1;
            if (job.attemptsMade >= maxAttempts) {
                console.warn(
                    `💀 Job ${job.name} exhausted retries. Updating DB, cleaning S3 & temp dir for ${videoId}...`,
                );
                try {
                    // Update Database Status to FAILED
                    await prisma.videos.update({
                        where: { id: videoId },
                        data: {
                            processingStatus: "FAILED",
                            processingError: err.message || "Unknown error",
                        },
                    });

                    // --- WS NOTIFICATION ---
                    const { cacheVideoStatus, publishToVideoChannel } =
                        await import("../lib/ws/definitions");

                    await cacheVideoStatus(videoId, {
                        status: "FAILED",
                        error: err.message || "Processing failed",
                    });

                    await publishToVideoChannel(videoId, {
                        type: "error",
                        status: "FAILED",
                        error: err.message || "Processing failed",
                    });

                    // Clean up S3 processed artifacts (orphaned segments)
                    await deleteS3Prefix(`processed/${videoId}/`).catch((e) =>
                        console.warn(
                            `⚠️ S3 cleanup failed for processed/${videoId}:`,
                            e,
                        ),
                    );

                    // Clean up local temp directory
                    const vidDir = path.join(getTempDir(), videoId);
                    if (fs.existsSync(vidDir)) {
                        fs.rmSync(vidDir, { recursive: true, force: true });
                        console.log(`🧹 Cleaned up ${vidDir}`);
                    }
                } catch (e) {
                    console.error("Failed to handle job failure cleanup:", e);
                }
            }
        }
    });

    // Debug Listeners
    worker.on("ready", () => {
        console.log(`[Worker] 🟢 Worker is ready and connected to Redis`);
    });

    worker.on("error", (err) => {
        console.error(`[Worker] 🔴 Worker Error:`, err);
    });

    worker.on("stalled", (jobId) => {
        console.warn(`[Worker] ⚠️ Job ${jobId} stalled!`);
    });

    worker.on("completed", (job) => {
        console.log(`[Worker] ✅ Job ${job.id} completed!`);
    });

    console.log(`👷 Transcoder Worker started on queue: ${QUEUES.TRANSCODE}`);
    return worker;
};

/**
 * 1. PROBE STEP
 * Downloads file, Checks Resolution, Spawns Parallel Flow
 */
async function handleProbeAndSplit(job: Job) {
    const { videoId, fileName } = job.data;
    // Use the fileName provided by the event (which includes the full S3 key + extension)
    const s3Key = fileName;
    const localInput = path.join(getTempDir(), videoId, "source");

    ensureDir(path.dirname(localInput));

    // Download
    console.log(`[Pipeline] ⬇️ Downloading ${s3Key} to ${localInput}...`);
    await downloadFile(s3Key, localInput);

    // Probe
    const metadata = await probeVideo(localInput);
    console.log(
        `🔎 Probed ${videoId}: ${metadata.width}x${metadata.height}, ${metadata.duration}s`,
    );

    // Decision Ladder
    const height = metadata.height;
    const resolutions = [];

    if (height >= 2160)
        resolutions.push({
            width: 3840,
            height: 2160,
            bandwidth: 14000000,
            name: "4k",
        });
    if (height >= 1440)
        resolutions.push({
            width: 2560,
            height: 1440,
            bandwidth: 10000000,
            name: "2k",
        });
    if (height >= 1080)
        resolutions.push({
            width: 1920,
            height: 1080,
            bandwidth: 6000000,
            name: "1080p",
        });
    if (height >= 480)
        resolutions.push({
            width: 854,
            height: 480,
            bandwidth: 1500000,
            name: "480p",
        });
    resolutions.push({
        width: 640,
        height: 360,
        bandwidth: 800000,
        name: "360p",
    }); // Always include 360p

    // Detect if this is a Short (Vertical video)
    const isShort = metadata.width < metadata.height;

    // Update DB with metadata and status
    console.log(
        `[Pipeline] 💾 Updating DB for ${videoId} (Status: PROCESSING, isShort: ${isShort})`,
    );
    await prisma.videos.update({
        where: { id: videoId },
        data: {
            processingStatus: "PROCESSING",
            duration: Math.round(metadata.duration),
            width: metadata.width,
            height: metadata.height,
            fps: metadata.fps,
            isShort: isShort,
            resolutions: resolutions.map((r) => r.name),
        },
    });

    // Chain: Probe -> Content Moderation -> Transcode Flow
    // Instead of spawning the flow directly, we pass the baton to the Moderator.
    // const { transcodeQueue } = await import("./definitions.js");
    await transcodeQueue.add(
        JOBS.CONTENT_MODERATION,
        {
            videoId,
            inputPath: s3Key,
            resolutions,
            metadata: {
                duration: metadata.duration,
                fps: metadata.fps,
                audioCodec: metadata.audioCodec, // For passthrough detection
            },
        },
        {
            removeOnComplete: { count: 100, age: 24 * 3600 },
            removeOnFail: { age: 24 * 3600 },
        },
    );

    console.log(`🛡️ Sent ${videoId} to Content Moderation`);

    return { resolutions };
}

/**
 * 1.5 CONTENT MODERATION (Stub)
 * Checks for NSFW/Copyright.
 */
async function handleContentModeration(job: Job) {
    const { videoId, inputPath, resolutions, metadata } = job.data;

    console.log(`🛡️ Scanning content for video ${videoId}...`);

    // Stub: Simulate AI check delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Future: Call external API (e.g. AWS Rekognition)
    // if (unsafe) throw new Error("Content Policy Violation");

    console.log(`✅ Content checks passed for ${videoId}`);

    // Proceed to Transcode Flow
    await addTranscodeFlow(videoId, inputPath, resolutions, metadata);

    return { status: "approved" };
}

/**
 * 2. TRANSCODE CHUNK
 * Transcodes 1 resolution with lock heartbeat and shared input cache
 */
async function handleTranscodeChunk(job: Job) {
    const { videoId, inputPath: s3Key, resolution, audioCodec } = job.data;
    const localDir = path.join(getTempDir(), videoId, resolution.name);

    ensureDir(localDir);

    // Distributed Locking with short TTL + heartbeat
    const lockKey = `lock:transcode:${videoId}:${resolution.name}`;
    const lockTTL = config.lock.ttlSeconds;
    const heartbeatInterval = config.lock.heartbeatIntervalMs;

    // Try to acquire lock
    const acquired = await redis.set(
        lockKey,
        String(process.pid),
        "EX",
        lockTTL,
        "NX",
    );

    if (!acquired) {
        console.log(
            `🔒 Lock held for ${s3Key} (${resolution.name}), skipping duplicate...`,
        );
        // Wait for result file to appear (simple poll for now)
        const resultPath = path.join(localDir, "playlist.m3u8");
        try {
            // Wait using configurable timeout for other worker to finish
            await waitForFile(resultPath, config.fileWaitTimeoutMs);
            return { resolution: resolution.name };
        } catch (e) {
            throw new Error(
                "Timeout waiting for other worker to finish transcoding",
            );
        }
    }

    // Start lock heartbeat to keep lock alive during long transcodes
    let heartbeatTimer: NodeJS.Timeout | null = null;
    const startHeartbeat = () => {
        heartbeatTimer = setInterval(async () => {
            try {
                await redis.expire(lockKey, lockTTL);
                // Heartbeat is working - no need to log every 30s
            } catch (e) {
                console.warn(`⚠️ Heartbeat failed for ${lockKey}:`, e);
            }
        }, heartbeatInterval);
    };

    const stopHeartbeat = () => {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
    };

    try {
        startHeartbeat();

        // Use shared input cache - prevents multiple downloads of same file
        console.log(`[Pipeline] 📂 Ensuring input file available: ${s3Key}`);
        const localInput = await ensureOriginalFile(videoId, s3Key);

        console.log(`⚙️ Transcoding ${resolution.name}...`);
        await transcodeResolution(
            localInput,
            localDir,
            resolution,
            async (percent) => {
                await job.updateProgress({ progress: percent, videoId });
            },
            { sourceAudioCodec: audioCodec }, // Enable passthrough if source is AAC
        );

        // Upload Artifacts (Playlist + Segments)
        console.log(`⬆️ Uploading ${resolution.name} artifacts...`);
        const files = fs.readdirSync(localDir);
        for (const file of files) {
            const key = `processed/${videoId}/${resolution.name}/${file}`;
            const contentType = file.endsWith(".m3u8")
                ? "application/vnd.apple.mpegurl"
                : "video/MP2T";
            await uploadFile(key, path.join(localDir, file), contentType);
        }
    } finally {
        // Stop heartbeat
        stopHeartbeat();

        // Always Release Lock
        await redis.del(lockKey);

        // Cleanup local resolution artifacts
        try {
            fs.rmSync(localDir, { recursive: true, force: true });
        } catch (e) {
            console.warn(`⚠️ Cleanup failed: ${e}`);
        }
    }

    return { resolution: resolution.name };
}

/**
 * Helper: Wait for file to appear
 */
async function waitForFile(
    filePath: string,
    timeout = config.fileWaitTimeoutMs,
) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (fs.existsSync(filePath)) return;
        await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error(`Timeout waiting for file: ${filePath}`);
}
/**
 * 3. THUMBNAILS
 */
async function handleThumbnails(job: Job) {
    const { videoId, inputPath: s3Key } = job.data;
    const localDir = path.join(getTempDir(), videoId, "thumbnails");

    ensureDir(localDir);

    // Use shared input cache to prevent duplicate downloads
    const localInput = await ensureOriginalFile(videoId, s3Key);

    console.log(`[Pipeline] 📷 Generating thumbnails...`);
    const filenames = await generateThumbnails(localInput, localDir);

    const thumbnailKeys = [];
    for (const file of filenames) {
        const key = `processed/${videoId}/thumbnails/${file}`;
        await uploadFile(key, path.join(localDir, file), "image/jpeg");
        thumbnailKeys.push(key);
    }

    // Publish Thumbnails Event
    console.log(`[Pipeline] 📷 Generated thumbnails for ${videoId}`);

    return { thumbnailKeys };
}

/**
 * 3a. SPRITE GENERATION
 */
async function handleGenerateSprite(job: Job) {
    const { videoId, inputPath: s3Key, duration } = job.data;
    const localDir = path.join(getTempDir(), videoId, "sprite");

    ensureDir(localDir);

    // Use shared input cache to prevent duplicate downloads
    const localInput = await ensureOriginalFile(videoId, s3Key);

    console.log(
        `[Pipeline] 🎞️ Generating preview sprite (duration: ${duration}s)...`,
    );
    // Use adaptive strategy based on duration
    const { spriteFile, vttFile } = await generatePreviewSprite(
        localInput,
        localDir,
        duration,
    );

    // Upload Sprite
    const spriteKey = `processed/${videoId}/sprite/${spriteFile}`;
    await uploadFile(spriteKey, path.join(localDir, spriteFile), "image/jpeg");

    // Upload VTT
    const vttKey = `processed/${videoId}/sprite/${vttFile}`;
    await uploadFile(vttKey, path.join(localDir, vttFile), "text/vtt");

    // Cleanup
    try {
        fs.rmSync(localDir, { recursive: true, force: true });
    } catch (e) {}

    return { spriteKey, spriteVttKey: vttKey };
}

/**
 * Helper: Wait for file to appear and lock to disappear
 */

/**
 * 4. MERGE (Root)
 * Waits for all, creates master playlist, notifies completion
 */
async function handleMergeManifest(job: Job) {
    const { videoId, resolutions, metadata } = job.data;

    // Get children results
    const childrenValues = await job.getChildrenValues();

    // Extract thumbnail keys
    let thumbnailOptions: string[] = [];
    // Extract Sprite Keys
    let previewSprite: string | undefined = undefined;
    let previewSpriteVtt: string | undefined = undefined;

    Object.values(childrenValues).forEach((val: any) => {
        if (val && val.thumbnailKeys) {
            thumbnailOptions = val.thumbnailKeys;
        }
        if (val && val.spriteKey) {
            previewSprite = val.spriteKey;
        }
        if (val && val.spriteVttKey) {
            previewSpriteVtt = val.spriteVttKey;
        }
    });

    const localDir = path.join(getTempDir(), videoId);
    ensureDir(localDir); // Ensure dir exists even if worker restarted
    console.log("📝 Creating Master Playlist...");
    await createMasterPlaylist(localDir, resolutions);

    const masterKey = `processed/${videoId}/master.m3u8`;
    await uploadFile(
        masterKey,
        path.join(localDir, "master.m3u8"),
        "application/vnd.apple.mpegurl",
    );

    console.log("✅ Transcoding Flow Complete!");

    // Publish Event to RabbitMQ (Commented out as per previous logic)
    console.log(`[Pipeline] 📤 Publishing TRANSCODER_COMPLETED for ${videoId}`);

    const finalStatus = {
        status: "READY" as const,
        progress: 100,
        hlsUrl: masterKey,
        thumbnails: thumbnailOptions,
        previewSprite,
        previewSpriteVtt,
    };

    // Update Cache and Notify via WebSockets
    const { cacheVideoStatus, publishToVideoChannel } =
        await import("../lib/ws/definitions");

    // IDEMPOTENCY GUARD: Check current status before updating
    const currentVideo = await prisma.videos.findUnique({
        where: { id: videoId },
        select: { processingStatus: true },
    });

    if (currentVideo?.processingStatus === "READY") {
        console.warn(
            `⚠️ Video ${videoId} already READY, skipping duplicate update`,
        );
        // Still cleanup local files
        fs.rmSync(path.join(getTempDir(), videoId), {
            recursive: true,
            force: true,
        });
        return { masterKey, thumbnailOptions, previewSprite, previewSpriteVtt };
    }

    // 1. Update Database (System of Record)
    console.log(
        `[Pipeline] 💾 Updating Database for ${videoId} (Status: READY)...`,
    );
    await prisma.videos.update({
        where: { id: videoId },
        data: {
            processingStatus: "READY",
            processingProgress: 100,
            hlsPlaylistUrl: masterKey,
            thumbnailUrl: thumbnailOptions[0] || null, // Default to first thumbnail
            thumbnailOptions: thumbnailOptions,
            previewSprite: previewSprite || null,
            previewSpriteVtt: previewSpriteVtt || null,
            publishedAt: new Date(),
        },
    });

    await cacheVideoStatus(videoId, {
        status: "READY",
        progress: 100,
        hlsUrl: masterKey,
        thumbnails: thumbnailOptions,
    });
    await publishToVideoChannel(videoId, {
        type: "completed",
        ...finalStatus,
    });

    // Cleanup local files
    fs.rmSync(path.join(getTempDir(), videoId), {
        recursive: true,
        force: true,
    });

    // OPTIMIZATION: Delete raw source file from S3 to save storage
    // We only keep the processed HLS artifacts
    try {
        const { deleteS3Prefix } = await import("../lib/storage");
        await deleteS3Prefix(`raw-videos/${videoId}/`);
        console.log(`[Pipeline] 🗑️ Cleaned up raw source for ${videoId}`);
    } catch (e) {
        console.warn(
            `[Pipeline] ⚠️ Failed to cleanup raw source for ${videoId}`,
            e,
        );
    }

    return { masterKey, thumbnailOptions, previewSprite, previewSpriteVtt };
}
