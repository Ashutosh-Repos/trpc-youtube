/*
  Warnings:

  - You are about to drop the column `emailEnabled` on the `notification_settings` table. All the data in the column will be lost.
  - You are about to drop the column `mentions` on the `notification_settings` table. All the data in the column will be lost.
  - You are about to drop the column `pushEnabled` on the `notification_settings` table. All the data in the column will be lost.
  - You are about to drop the `video_views` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "video_views" DROP CONSTRAINT "video_views_videoId_fkey";

-- AlterTable
ALTER TABLE "notification_settings" DROP COLUMN "emailEnabled",
DROP COLUMN "mentions",
DROP COLUMN "pushEnabled";

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "groupCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "groupKey" TEXT,
ADD COLUMN     "isHidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "metadata" JSONB;

-- AlterTable
ALTER TABLE "user_interests" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "watch_history" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- DropTable
DROP TABLE "video_views";

-- CreateIndex
CREATE INDEX "comments_videoId_parentId_status_isPinned_likeCount_created_idx" ON "comments"("videoId", "parentId", "status", "isPinned" DESC, "likeCount" DESC, "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notifications_userId_isHidden_createdAt_idx" ON "notifications"("userId", "isHidden", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "notifications_videoId_type_idx" ON "notifications"("videoId", "type");

-- CreateIndex
CREATE INDEX "notifications_groupKey_idx" ON "notifications"("groupKey");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "videos_channelId_deletedAt_idx" ON "videos"("channelId", "deletedAt");

-- CreateIndex
CREATE INDEX "videos_title_idx" ON "videos"("title");

-- CreateIndex
CREATE INDEX "videos_description_idx" ON "videos"("description");

-- CreateIndex
CREATE INDEX "videos_visibility_processingStatus_isShort_hotScore_idx" ON "videos"("visibility", "processingStatus", "isShort", "hotScore" DESC);

-- CreateIndex
CREATE INDEX "videos_visibility_processingStatus_isShort_trendingScore_idx" ON "videos"("visibility", "processingStatus", "isShort", "trendingScore" DESC);
