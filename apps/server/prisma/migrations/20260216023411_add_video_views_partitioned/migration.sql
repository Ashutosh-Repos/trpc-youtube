/*
  Warnings:

  - A unique constraint covering the columns `[idempotencyKey]` on the table `videos` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "videos" ADD COLUMN     "idempotencyKey" TEXT;

-- CreateTable
CREATE TABLE "video_views" (
    "id" BIGSERIAL NOT NULL,
    "videoId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_views_pkey" PRIMARY KEY ("id","createdAt")
);

-- CreateIndex
CREATE INDEX "video_views_videoId_createdAt_idx" ON "video_views"("videoId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "videos_idempotencyKey_key" ON "videos"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "video_views" ADD CONSTRAINT "video_views_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;
