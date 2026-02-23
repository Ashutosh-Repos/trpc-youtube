import "dotenv/config";
import { setupWorker } from "./queue/worker";
import { setupSchedulerWorker } from "./queue/scheduler";
import { startEngagementWorker } from "./queue/engagement-worker";
import { startScoringWorker } from "./queue/scoring-worker";
import { NotificationService } from "./services/NotificationService";
import config from "./config";
import prisma from "./lib/prisma";

async function start() {
    const workerType = process.env.WORKER_TYPE;
    console.log(
        `👷 Starting Background Workers... ${workerType ? `(type: ${workerType})` : "(all)"}`,
    );

    // 1. Video Transcoding Worker
    if (workerType === "transcode" || !workerType) {
        console.log("   - Initializing Transcode Worker...");
        setupWorker();
    }

    // 2. Scheduler (Cron)
    if (
        workerType === "scheduler" ||
        workerType === "services" ||
        !workerType
    ) {
        console.log("   - Initializing Scheduler...");
        setupSchedulerWorker();
    }

    // 3. Engagement (Likes/Views)
    if (
        workerType === "engagement" ||
        workerType === "services" ||
        !workerType
    ) {
        console.log("   - Initializing Engagement Workers...");
        startEngagementWorker();
    }

    // 4. Scoring (Pool Calculation)
    if (workerType === "scoring" || workerType === "services" || !workerType) {
        console.log("   - Initializing Scoring Worker...");
        startScoringWorker();
    }

    // 5. Notification TTL Cleanup Cron (runs daily)
    // Only run in "services" mode or when all workers are running
    if (workerType === "services" || !workerType) {
        console.log("   - Scheduling Notification TTL Cleanup...");
        NotificationService.cleanupOldNotifications(); // Run once on startup
        setInterval(
            () => {
                NotificationService.cleanupOldNotifications();
            },
            24 * 60 * 60 * 1000,
        ); // And every 24 hours
    }

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
