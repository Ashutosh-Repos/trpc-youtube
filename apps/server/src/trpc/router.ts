import { router, publicProcedure, protectedProcedure } from "./trpc";
import { videoRouter } from "./routers/video";
import { channelRouter } from "./routers/channel";
import { playlistRouter } from "./routers/playlist";
import { categoryRouter } from "./routers/category";
import { userRouter } from "./routers/user";
import { historyRouter } from "./routers/history";
import { engagementRouter } from "./routers/engagement";
import { commentRouter } from "./routers/comment";
import { notificationRouter } from "./routers/notification";
import { z } from "zod";

export const appRouter = router({
    channel: channelRouter,
    video: videoRouter,
    playlist: playlistRouter,
    category: categoryRouter,
    user: userRouter,
    history: historyRouter,
    engagement: engagementRouter,
    comment: commentRouter,
    notification: notificationRouter,
    /**
     * Public endpoint - anyone can call
     */
    hello: publicProcedure
        .input(z.object({ name: z.string().optional() }))
        .query(({ input }) => {
            return {
                greeting: `Hello ${input.name ?? "world"}`,
            };
        }),

    /**
     * Health check endpoint
     */
    health: publicProcedure.query(() => {
        return { status: "ok", timestamp: new Date() };
    }),

    /**
     * Protected endpoint - requires authentication
     * Returns current user info
     */
    getMe: protectedProcedure.query(({ ctx }) => {
        return {
            id: ctx.user.id,
            name: ctx.user.name,
            email: ctx.user.email,
            image: ctx.user.image,
        };
    }),
});

export type AppRouter = typeof appRouter;
