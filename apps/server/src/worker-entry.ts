import "dotenv/config";
import { setupWorker } from "./queue/worker";
import { setupSchedulerWorker } from "./queue/scheduler";
import { startEngagementWorker } from "./queue/engagement-worker";
import { NotificationService } from "./services/NotificationService";
import config from "./config";
import prisma from "./lib/prisma";

async function start() {
    console.log("👷 Starting Background Workers...");

    // 1. Video Transcoding Worker
    if (process.env.WORKER_TYPE === "transcode" || !process.env.WORKER_TYPE) {
        console.log("   - Initializing Transcode Worker...");
        setupWorker();
    }

    // 2. Scheduler (Cron)
    if (process.env.WORKER_TYPE === "scheduler" || !process.env.WORKER_TYPE) {
        console.log("   - Initializing Scheduler...");
        setupSchedulerWorker();
    }

    // 3. Engagement (Likes/Views)
    if (process.env.WORKER_TYPE === "engagement" || !process.env.WORKER_TYPE) {
        console.log("   - Initializing Engagement Workers...");
        startEngagementWorker();
    }

    // 4. Notification TTL Cleanup Cron (runs daily)
    console.log("   - Scheduling Notification TTL Cleanup...");
    NotificationService.cleanupOldNotifications(); // Run once on startup
    setInterval(
        () => {
            NotificationService.cleanupOldNotifications();
        },
        24 * 60 * 60 * 1000,
    ); // And every 24 hours

    console.log("✅ Workers Initialized.");

    // Graceful Shutdown
    const shutdown = async (signal: string) => {
        console.log(`\n🛑 Received ${signal}, shutting down workers...`);
        await prisma.$disconnect();
        process.exit(0);
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
}

start().catch((err) => {
    console.error("❌ Worker failed to start:", err);
    process.exit(1);
});
