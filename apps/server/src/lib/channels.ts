import prisma from "./prisma";

/**
 * Updates the cached video count and total views for a channel.
 * Typically called after video publication, deletion, or visibility changes.
 */
export async function updateChannelStats(channelId: string) {
    // 1. Count all videos that are not soft-deleted (including unlisted/private/scheduled)
    const videoCount = await prisma.videos.count({
        where: {
            channelId,
            deletedAt: null,
        },
    });

    // 2. Sum total views for all videos (unlisted links still accrue views)
    const aggregate = await prisma.videos.aggregate({
        where: {
            channelId,
            deletedAt: null,
        },
        _sum: {
            viewCount: true,
        },
    });

    const totalViews = aggregate._sum.viewCount ?? 0;

    // 3. Update Channel
    await prisma.channels.update({
        where: { id: channelId },
        data: {
            videoCount,
            totalViews,
        },
    });

    return { videoCount, totalViews };
}
