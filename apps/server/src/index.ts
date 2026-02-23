import "dotenv/config";
import express from "express";
import cluster from "cluster";
import os from "os";
import cors from "cors";
import helmet from "helmet";
import http from "http";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import * as trpcExpress from "@trpc/server/adapters/express";
import { Redis } from "ioredis";
import { appRouter } from "./trpc/router";
import { createContext } from "./trpc/context";
import { setupWorker, worker } from "./queue/worker";
import { setupSchedulerWorker } from "./queue/scheduler";
import { setupWs } from "./trpc/ws";
import { transcodeQueue, JOBS } from "./queue/definitions";
import { startEngagementWorker } from "./queue/engagement-worker";
import prisma from "./lib/prisma";
import config from "./config";
import { MinioEventPayload, S3EventRecord } from "./types/minio";
import { WebSocketServer } from "ws";

const isClusterPrimary =
    process.env.CLUSTER_MODE === "true" && cluster.isPrimary;

if (isClusterPrimary) {
    const numCPUs = os.cpus().length;
    console.log(`[Cluster] Primary ${process.pid} is running`);
    console.log(`[Cluster] Forking for ${numCPUs} CPUs...`);

    let isShuttingDown = false;

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on("exit", (worker, code, signal) => {
        if (isShuttingDown) return;
        console.log(
            `[Cluster] Worker ${worker.process.pid} died. Restarting...`,
        );
        cluster.fork();
    });

    const shutdownPrimary = () => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        console.log(`\n[Cluster] Shutting down primary process...`);

        for (const id in cluster.workers) {
            if (cluster.workers[id]) {
                cluster.workers[id].process.kill("SIGTERM");
            }
        }

        setTimeout(() => {
            console.log(`[Cluster] Force quitting primary failsafe...`);
            process.exit(0);
        }, 4000).unref();
    };

    process.on("SIGINT", shutdownPrimary);
    process.on("SIGTERM", shutdownPrimary);
}

// Only start the application if we are NOT the primary process (or if clustering is disabled)
if (!isClusterPrimary) {
    const app = express();

    // Security headers
    app.use(helmet());

    // CORS with credentials for auth cookies
    app.use(
        cors({
            origin: config.corsOrigin || "http://localhost:3000",
            credentials: true,
        }),
    );

    app.use(express.json({ limit: "10mb" }));
    app.use(cookieParser());

    // tRPC endpoint with error logging
    app.use(
        "/trpc",
        trpcExpress.createExpressMiddleware({
            router: appRouter,
            createContext,
            onError({ error, path }) {
                console.error(`[tRPC Error] ${path}:`, error.message);
                if (process.env.NODE_ENV !== "production") {
                    console.error(error.stack);
                }
            },
        }),
    );

    // Health check with Redis and Prisma status
    app.get("/health", async (req, res) => {
        const health = {
            status: "ok",
            service: "youtube-server",
            uptime: process.uptime(),
            timestamp: Date.now(),
            checks: {
                redis: false,
                prisma: false,
            },
        };

        try {
            const redis = (await import("./lib/redis")).default;
            const redisCheck = await redis.ping();
            health.checks.redis = redisCheck === "PONG";
        } catch {}

        try {
            await prisma.$queryRaw`SELECT 1`;
            health.checks.prisma = true;
        } catch {}

        const isHealthy = health.checks.redis && health.checks.prisma;
        res.status(isHealthy ? 200 : 503).json(health);
    });

    // Simple root health check
    app.get("/", (req, res) => {
        res.json({ status: "ok", service: "youtube-server" });
    });

    // ...

    // Create HTTP server for WebSocket support
    const server = http.createServer(app);

    // Initialize workers
    // Initialize workers ONLY if enabled (e.g. in Dev or monolithic mode)
    if (process.env.ENABLE_WORKERS === "true") {
        console.log(
            "🔧 ENABLE_WORKERS=true: Starting workers in this process...",
        );
        setupWorker();
        setupSchedulerWorker();
        startEngagementWorker();
    } else {
        console.log(
            "ℹ️ Workers skipped (Set ENABLE_WORKERS=true to run them here)",
        );
    }

    // Initialize WebSocket server
    const wss = new WebSocketServer({ server });
    const { shutdown: shutdownWs } = setupWs(wss);

    // Track monitor client for shutdown
    let monitorRedis: Redis | null = null;
    let cleanupTimer: NodeJS.Timeout | null = null;

    // --- STARTUP CLEANUP ---
    const getTempDir = () => config.tempDir;

    const startupCleanup = () => {
        const tempDir = getTempDir();
        console.log(
            `[Startup] 🧹 Checking for orphaned temp files in ${tempDir}...`,
        );
        try {
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
                console.log(`[Startup] ✅ Cleaned orphaned temp storage`);
            }
            fs.mkdirSync(tempDir, { recursive: true });
        } catch (err) {
            console.warn(`[Startup] ⚠️ Cleanup failed:`, err);
        }
    };

    // --- SCHEDULED CLEANUP ---
    const startScheduledCleanup = () => {
        const cleanupIntervalMs = config.cleanupIntervalMs;
        const maxTempAgeMs = config.maxTempAgeMs;
        const tempDir = getTempDir();

        console.log(
            `[Cleanup] 🗓️ Scheduled cleanup every ${cleanupIntervalMs / 60000} minutes`,
        );

        cleanupTimer = setInterval(async () => {
            try {
                if (!fs.existsSync(tempDir)) return;

                const now = Date.now();
                const entries = fs.readdirSync(tempDir, {
                    withFileTypes: true,
                });

                // Clean stale temp directories
                for (const entry of entries) {
                    if (!entry.isDirectory()) continue;

                    const dirPath = path.join(tempDir, entry.name);
                    try {
                        const stats = fs.statSync(dirPath);
                        const ageMs = now - stats.mtimeMs;

                        if (ageMs > maxTempAgeMs) {
                            fs.rmSync(dirPath, {
                                recursive: true,
                                force: true,
                            });
                            console.log(
                                `[Cleanup] 🧹 Removed stale directory: ${entry.name}`,
                            );
                        }
                    } catch {}
                }

                // Zombie cleanup - expired uploads
                const expiredVideos = await prisma.videos.findMany({
                    where: {
                        processingStatus: { in: ["UPLOADING", "FAILED"] },
                        uploadExpiresAt: {
                            lt: new Date(Date.now() - 5 * 60 * 1000),
                        },
                    },
                    select: { id: true },
                    take: 50,
                });

                if (expiredVideos.length > 0) {
                    const { deleteS3Prefix } = await import("./lib/storage");
                    const { deleteVideoMetadata } =
                        await import("./lib/ws/definitions");

                    for (const video of expiredVideos) {
                        const videoId = video.id;
                        console.log(
                            `[Cleanup] 💀 Purging expired zombie: ${videoId}`,
                        );

                        await Promise.all([
                            deleteS3Prefix(`raw-videos/${videoId}/`).catch(
                                () => {},
                            ),
                            deleteS3Prefix(`processed/${videoId}/`).catch(
                                () => {},
                            ),
                        ]);

                        const vidDir = path.join(tempDir, videoId);
                        if (fs.existsSync(vidDir)) {
                            fs.rmSync(vidDir, { recursive: true, force: true });
                        }

                        await prisma.videos
                            .delete({ where: { id: videoId } })
                            .catch(() => {});
                        await deleteVideoMetadata(videoId).catch(() => {});
                    }

                    console.log(
                        `[Cleanup] ✅ Purged ${expiredVideos.length} zombies`,
                    );
                }
            } catch (err) {
                console.warn(`[Cleanup] ⚠️ Scheduled cleanup error:`, err);
            }
        }, cleanupIntervalMs);
    };

    // --- MINIO EVENT MONITOR ---
    const startEventMonitor = async () => {
        const localRedisUrl =
            process.env.LOCAL_REDIS_URL ||
            process.env.REDIS_URL ||
            "redis://localhost:6379";
        console.log(
            `[Monitor] Connecting to Redis for MinIO events: ${localRedisUrl.replace(/:[^:@]+@/, ":***@")}`,
        );

        const parseRedisUrl = (url: string) => {
            try {
                const parsed = new URL(url);
                return {
                    host: parsed.hostname || "localhost",
                    port: parseInt(parsed.port || "6379"),
                    password: parsed.password || undefined,
                    username: parsed.username || undefined,
                    tls: url.startsWith("rediss://")
                        ? { rejectUnauthorized: false }
                        : undefined,
                };
            } catch {
                const [host, port] = url.split(":");
                return {
                    host: host || "localhost",
                    port: parseInt(port || "6379"),
                };
            }
        };

        const redisOptions = parseRedisUrl(localRedisUrl);
        monitorRedis = new Redis({
            ...redisOptions,
            maxRetriesPerRequest: null,
        });

        monitorRedis.on("connect", () => {
            console.log("[Monitor] ✅ Connected to Redis for MinIO events");
        });

        monitorRedis.on("error", (err) => {
            console.error("[Monitor] ❌ Redis Connection Error:", err);
        });

        const LIST_KEY = "minio_events";
        console.log(`[Monitor] 📡 Listening for MinIO events on: ${LIST_KEY}`);

        while (true) {
            try {
                const result = await monitorRedis.blpop(LIST_KEY, 0);
                if (!result) continue;

                const [, payload] = result;
                console.log(`[Monitor] 📦 Received MinIO event`);

                let event: MinioEventPayload;
                try {
                    event = JSON.parse(payload);
                } catch {
                    console.error("[Monitor] ❌ Failed to parse event JSON");
                    continue;
                }

                let records: S3EventRecord[] = [];

                if (Array.isArray(event)) {
                    for (const item of event) {
                        if ("Event" in item && Array.isArray(item.Event)) {
                            records.push(...item.Event);
                        }
                    }
                } else if ("Records" in event && Array.isArray(event.Records)) {
                    records = event.Records;
                }

                for (const record of records) {
                    const eventName = record.eventName || "";
                    if (!eventName.startsWith("s3:ObjectCreated:")) continue;

                    const s3Key = decodeURIComponent(
                        record.s3.object.key.replace(/\+/g, " "),
                    );
                    const match = s3Key.match(/^raw-videos\/([^/]+)\/([^/]+)$/);

                    if (match) {
                        console.log(
                            `[Monitor] 📥 Video upload event: ${s3Key}`,
                        );
                        const videoId = match[1];

                        const video = await prisma.videos.findUnique({
                            where: { id: videoId },
                            select: { id: true, processingStatus: true },
                        });

                        if (!video) {
                            console.warn(
                                `[Monitor] ⚠️ Video ${videoId} not found`,
                            );
                            continue;
                        }

                        if (video.processingStatus === "READY") {
                            console.warn(
                                `[Monitor] ⚠️ Video ${videoId} already READY`,
                            );
                            continue;
                        }

                        console.log(
                            `[Monitor] 🚀 Triggering transcode for ${videoId}`,
                        );

                        await transcodeQueue.add(
                            JOBS.PROBE_AND_SPLIT,
                            { videoId, fileName: s3Key },
                            { jobId: videoId },
                        );
                    }
                }
            } catch (error) {
                console.error(
                    "[Monitor] ❌ Error processing MinIO event:",
                    error,
                );
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        }
    };

    // --- GRACEFUL SHUTDOWN ---
    const shutdown = async (signal: string) => {
        console.log(`\n🛑 Received ${signal}, shutting down...`);

        if (cleanupTimer) {
            clearInterval(cleanupTimer);
            console.log("🧹 Cleanup timer stopped");
        }

        const { killAllFfmpeg } = await import("./lib/ffmpeg");
        await killAllFfmpeg();

        await shutdownWs();
        try {
            server.close();
        } catch (e) {
            // Ignore EPIPE if primary disconnected
        }

        if (monitorRedis) {
            try {
                await monitorRedis.quit();
            } catch (e) {}
            console.log("📡 Monitor Redis closed");
        }

        try {
            const { prisma } = await import("./lib/prisma");
            await prisma.$disconnect();
            console.log("🗄️ Prisma disconnected");
        } catch (e) {}

        if (worker) {
            try {
                await worker.close();
            } catch (e) {}
            console.log("👷 Worker closed");
        }

        const { schedulerWorker } = await import("./queue/scheduler");
        if (schedulerWorker) {
            try {
                await schedulerWorker.close();
            } catch (e) {}
            console.log("👷 Scheduler Worker closed");
        }

        const { stopWorker: stopEngagementWorker } =
            await import("./queue/engagement-worker");
        try {
            await stopEngagementWorker();
        } catch (e) {}

        console.log("👋 Process terminated");
        process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));

    // --- START SERVER ---
    // Prevent Race Conditions: Only Worker #1 (or single process) handles cleanup and event monitoring.
    const isSingletonWorker = !cluster.isWorker || cluster.worker?.id === 1;

    if (isSingletonWorker) {
        console.log(
            `[Cluster] Worker ${process.pid} is designated as Singleton Orchestrator.`,
        );

        // Initialize storage (bucket, policy, lifecycle) — replaces docker createbuckets
        import("./lib/initStorage")
            .then(({ initStorage }) => initStorage())
            .catch((err) =>
                console.error("[Startup] ❌ Storage init failed:", err),
            );

        startupCleanup();
        startScheduledCleanup();
        startEventMonitor().catch((err) =>
            console.error("[Monitor] 💀 Monitor crashed:", err),
        );
    }

    server.listen(config.port, () => {
        console.log(`🚀 Server running on http://localhost:${config.port}`);
        console.log(`   tRPC: /trpc`);
        console.log(`   WebSocket: /ws/videos`); // Updated log? Actually it's just tRPC subscription now
        console.log(`   CORS: ${config.corsOrigin || "http://localhost:3000"}`);
        console.log(`   PID: ${process.pid}`);
    });
}

export type AppRouter = typeof appRouter;
