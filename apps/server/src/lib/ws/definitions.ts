import redis, { redisUrl } from "../redis";

// Publisher client (existing redis connection)
export const redisPub = redis;

// --- Keys & Constants ---

export const REDIS_KEYS = {
    videoStatus: (videoId: string) => `video:${videoId}:status`,
    videoWsChannel: (videoId: string) => `video:${videoId}:ws`,
    videoMetadata: (videoId: string) => `video:${videoId}:meta`,
};

export interface VideoMetadata {
    uploadId?: string;
    ownerId?: string;
    visibility?: string;
}

// --- Helper Functions ---

export interface VideoStatusCache {
    status: string;
    progress?: number;
    error?: string;
    thumbnails?: string[];
    hlsUrl?: string;
    retryable?: boolean;
}

/**
 * Cache video status for fast API retrieval
 * TTL: 24 hours (sufficient for active uploads)
 */
export async function cacheVideoStatus(
    videoId: string,
    status: VideoStatusCache,
): Promise<void> {
    const key = REDIS_KEYS.videoStatus(videoId);
    // Store as stringified JSON
    await redis.setex(key, 86400, JSON.stringify(status));
}

/**
 * Get cached status
 */
export async function getCachedVideoStatus(
    videoId: string,
): Promise<VideoStatusCache | null> {
    const key = REDIS_KEYS.videoStatus(videoId);
    const data = await redis.get(key);
    if (!data) return null;
    try {
        return JSON.parse(data) as VideoStatusCache;
    } catch {
        return null;
    }
}

/**
 * Publish real-time update to WebSocket server via Redis Channel
 */
import { z } from "zod";

export const VideoStatusEventSchema = z.object({
    status: z.enum(["UPLOADING", "PROCESSING", "READY", "FAILED"]).optional(),
    progress: z.number().optional(),
    error: z.string().optional(),
    hlsUrl: z.string().optional(),
    thumbnails: z.array(z.string()).optional(),
    previewSprite: z.string().optional(),
    previewSpriteVtt: z.string().optional(),
    type: z.string().optional(), // "error", "completed", "update"
    visibility: z.string().optional(),
    publishedAt: z.date().optional(),
});

export type VideoStatusEvent = z.infer<typeof VideoStatusEventSchema>;

/**
 * Publish real-time update to WebSocket server via Redis Channel
 * Accepts strictly typed events.
 */
export async function publishToVideoChannel(
    videoId: string,
    message: VideoStatusEvent,
): Promise<void> {
    const channel = REDIS_KEYS.videoWsChannel(videoId);
    // Validate before publish (Double safety)
    const payload = JSON.stringify(message); // Already typed, but could use safeParse if we distrust caller
    await redisPub.publish(channel, payload);
}

/**
 * Cache video metadata (uploadId, ownerId) to skip DB on chunk uploads
 * TTL: 12 hours
 */
export async function cacheVideoMetadata(
    videoId: string,
    metadata: VideoMetadata,
): Promise<void> {
    const key = REDIS_KEYS.videoMetadata(videoId);
    await redis.setex(key, 86400, JSON.stringify(metadata));
}

/**
 * Get cached metadata
 */
export async function getVideoMetadata(
    videoId: string,
): Promise<VideoMetadata | null> {
    const key = REDIS_KEYS.videoMetadata(videoId);
    const data = await redis.get(key);
    if (!data) return null;
    try {
        return JSON.parse(data) as VideoMetadata;
    } catch {
        return null;
    }
}

/**
 * Delete cached metadata
 */
export async function deleteVideoMetadata(videoId: string): Promise<void> {
    const key = REDIS_KEYS.videoMetadata(videoId);
    await redis.del(key);
}
