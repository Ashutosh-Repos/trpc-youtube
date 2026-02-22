import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { FeedService, feedCursorSchema } from "../../services/FeedService";

export const feedRouter = router({
    getHomeFeed: publicProcedure
        .input(
            z.object({
                cursor: feedCursorSchema.optional(),
            }),
        )
        .query(async ({ ctx, input }) => {
            return await FeedService.getHomeFeed(ctx.user?.id, input.cursor);
        }),

    getTrendingFeed: publicProcedure
        .input(
            z.object({
                cursor: feedCursorSchema.optional(),
            }),
        )
        .query(async ({ ctx, input }) => {
            return await FeedService.getTrendingFeed(
                ctx.user?.id,
                input.cursor,
            );
        }),

    getHomeShorts: publicProcedure
        .input(
            z.object({
                cursor: feedCursorSchema.optional(),
            }),
        )
        .query(async ({ ctx, input }) => {
            return await FeedService.getHomeShorts(ctx.user?.id, input.cursor);
        }),

    getTrendingShorts: publicProcedure
        .input(
            z.object({
                cursor: feedCursorSchema.optional(),
            }),
        )
        .query(async ({ ctx, input }) => {
            return await FeedService.getTrendingShorts(
                ctx.user?.id,
                input.cursor,
            );
        }),

    getRecommendations: publicProcedure
        .input(
            z.object({
                videoId: z.string(),
                cursor: feedCursorSchema.optional(),
            }),
        )
        .query(async ({ ctx, input }) => {
            return await FeedService.getRecommendations(
                input.videoId,
                ctx.user?.id,
                input.cursor,
            );
        }),

    getChannelVideos: publicProcedure
        .input(
            z.object({
                channelId: z.string(),
                cursor: feedCursorSchema.optional(),
            }),
        )
        .query(async ({ input }) => {
            return await FeedService.getChannelVideos(
                input.channelId,
                input.cursor,
            );
        }),
});
