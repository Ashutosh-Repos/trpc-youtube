import { FlowProducer } from "bullmq";
import { getRedisConnection } from "../lib/redis";
import { QUEUES, JOBS } from "./definitions";

export const flowProducer = new FlowProducer({
    connection: getRedisConnection(),
});

import config from "../config";

/**
 * Create the Transcode Flow
 *
 * Tree Structure:
 * 1. Root: 'merge-manifest' (Waits for all children)
 *    - Children: 'transcode-chunk' (One per resolution)
 *       - Dependency: 'probe-and-split' (Actually, we probe first, THEN create the flow...
 *         OR we have a dynamic flow. BullMQ supports adding children dynamically? No, simpler to build tree upfront.
 *         BUT we don't know resolutions until we PROBE.
 *
 * Revised Strategy:
 * 1. RabbitMQ -> Trigger 'probe-job' (Single Job).
 * 2. 'probe-job' Worker -> Probes file -> Decides resolutions -> Adds 'transcode-flow' (The tree).
 *
 * So this file defines the "Parallel Transcode Flow" that gets added *after* probing.
 */
export async function addTranscodeFlow(
    videoId: string,
    inputPath: string,
    resolutions: Array<{
        width: number;
        height: number;
        bandwidth: number;
        name: string;
    }>,
    metadata: { duration: number; fps: number; audioCodec?: string },
) {
    console.log(
        `[Pipeline] 🌊 Creating Transcode Flow for ${videoId} with ${resolutions.length} resolutions`,
    );
    // Common cleanup opts
    // Keep 100 completed jobs or 24h of history
    const JOB_OPTS = {
        removeOnComplete: { count: 100, age: 24 * 3600 },
        removeOnFail: { age: 24 * 3600 },
        attempts: config.queue.attempts,
        backoff: {
            type: "exponential",
            delay: 1000, // 1s, 2s, 4s
        },
    };

    // Leaf Jobs (Parallel Transcodes)
    const transcodeJobs = resolutions.map((res) => ({
        name: JOBS.TRANSCODE_CHUNK,
        queueName: QUEUES.TRANSCODE,
        data: {
            videoId,
            inputPath,
            resolution: res,
            audioCodec: metadata.audioCodec, // For passthrough detection
        },
        opts: { ...JOB_OPTS, failParentOnFailure: true }, // If one fails, the whole video fails (simplifies consistency)
    }));

    // Root Job (Merge & Cleanup)
    // It waits for all 'transcodeJobs' to finish.
    console.log(`[Pipeline] ➕ Adding Flow to BullMQ (Root: MERGE_MANIFEST)`);
    const flow = await flowProducer.add({
        name: JOBS.MERGE_MANIFEST,
        queueName: QUEUES.TRANSCODE,
        data: {
            videoId,
            resolutions,
            metadata,
        },
        opts: { ...JOB_OPTS },
        children: [
            ...transcodeJobs,
            {
                name: JOBS.GENERATE_THUMBNAILS,
                queueName: QUEUES.TRANSCODE,
                data: { videoId, inputPath },
                opts: { ...JOB_OPTS, failParentOnFailure: false }, // Thumbnails technically optional but highly desired
            },
            {
                name: JOBS.GENERATE_SPRITE,
                queueName: QUEUES.TRANSCODE,
                data: {
                    videoId,
                    inputPath,
                    duration: metadata.duration, // Pass duration for adaptive sprite interval
                },
                opts: { ...JOB_OPTS, failParentOnFailure: false }, // Optional
            },
        ],
    });

    return flow;
}
