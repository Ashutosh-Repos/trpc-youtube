import { prisma } from "../lib/prisma";

const RUN_INTERVAL_MS = 1000 * 60 * 5; // Every 5 minutes

export async function computeScores() {
    try {
        console.log(
            "[ScoringWorker] 🚀 Running Lightweight SQL Scoring Update...",
        );
        const startTime = Date.now();

        // Compute Scores via Postgres Raw Math functions
        await prisma.$executeRawUnsafe(`
            UPDATE videos
            SET 
                "engagementScore" = (("likeCount" * 2.0) + ("commentCount" * 3.0)) / GREATEST("viewCount", 1),
                "trendingScore" = "viewCount" / POWER(GREATEST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE("publishedAt", "createdAt")))/3600.0, 0) + 2.0, 1.5),
                "hotScore" = (("likeCount" * 2.0) + ("commentCount" * 3.0)) / GREATEST("viewCount", 1) * ("viewCount" / POWER(GREATEST(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - COALESCE("publishedAt", "createdAt")))/3600.0, 0) + 2.0, 1.5)),
                "lastScoredAt" = CURRENT_TIMESTAMP
            WHERE visibility = 'PUBLIC' AND "processingStatus" = 'READY'
            AND ("publishedAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days' OR "viewCount" > 0);
        `);

        console.log(
            `[ScoringWorker] ✅ SQL Scoring Complete in ${Date.now() - startTime}ms.`,
        );
    } catch (err) {
        console.error("[ScoringWorker] ❌ Error computing scores:", err);
    }
}

export function startScoringWorker() {
    console.log("[ScoringWorker] 🕒 Scheduled to run every 5 minutes.");
    computeScores();
    setInterval(computeScores, RUN_INTERVAL_MS);
}
