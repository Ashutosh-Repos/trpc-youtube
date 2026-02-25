import * as dotenv from "dotenv";
dotenv.config();

export const config = {
    port: parseInt(process.env.PORT || "4000"),
    nodeEnv: process.env.NODE_ENV || "development",
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
    publicWsUrl: process.env.PUBLIC_WS_URL || null,
    upload: {
        presignedUrlExpiry: parseInt(
            process.env.PRESIGNED_URL_EXPIRY || "3600",
        ), // 1 hour for part URLs
        dbRecordExpiry: parseInt(process.env.UPLOAD_DB_EXPIRY || "86400"), // 24 hours for the video record
    },
    s3: {
        endpoint: process.env.AWS_S3_ENDPOINT || "http://localhost:9000",
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "minioadmin",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "minioadmin",
        bucket: process.env.AWS_S3_BUCKET_NAME || "youtube-videos",
        region: process.env.AWS_REGION || "us-east-1",
        // Public URL for browser-facing presigned URLs (Railway deployment)
        publicUrl: process.env.PUBLIC_S3_URL || null,
    },
    redis: {
        url: process.env.REDIS_URL || "redis://localhost:6379",
    },
    queue: {
        concurrency: parseInt(process.env.TRANSCODER_CONCURRENCY || "2"),
        attempts: parseInt(process.env.TRANSCODER_RETRIES || "3"),
    },
    // Node-specific settings for horizontal scaling
    nodeId:
        process.env.NODE_ID || process.env.HOSTNAME || `node-${process.pid}`,
    tempDir: process.env.TEMP_DIR || "/tmp/transcoder",

    // --- New Reliability & Scalability Settings ---
    hwAccel: (process.env.HW_ACCEL || "none") as
        | "none"
        | "nvenc"
        | "videotoolbox"
        | "vaapi",
    progressThrottleMs: parseInt(process.env.PROGRESS_THROTTLE_MS || "5000"), // 5 seconds
    cleanupIntervalMs: parseInt(process.env.CLEANUP_INTERVAL_MS || "900000"), // 15 minutes
    maxTempAgeMs: parseInt(process.env.MAX_TEMP_AGE_MS || "7200000"), // 2 hours
    lock: {
        ttlSeconds: 120, // 2 minutes (short TTL, refreshed via heartbeat)
        heartbeatIntervalMs: 30000, // Refresh every 30 seconds
    },
    // --- Long-Running Operation Timeouts ---
    downloadTimeoutMs: parseInt(process.env.DOWNLOAD_TIMEOUT_MS || "1800000"), // 30 minutes for large files
    jobLockDurationMs: parseInt(process.env.JOB_LOCK_DURATION_MS || "1800000"), // 30 minutes
    fileWaitTimeoutMs: parseInt(process.env.FILE_WAIT_TIMEOUT_MS || "1800000"), // 30 minutes
};

export default config;
