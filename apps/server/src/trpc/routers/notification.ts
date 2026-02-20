import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { NotificationService } from "../../services/NotificationService";
import { redisSubscriptionManager } from "../../lib/ws/redisSubscription";
import { on } from "events";
import prisma from "../../lib/prisma";

export const notificationRouter = router({
    list: protectedProcedure
        .input(
            z.object({
                limit: z.number().min(1).max(50).default(20),
                cursor: z.string().nullish(),
            }),
        )
        .query(async ({ ctx, input }) => {
            const { limit, cursor } = input;
            const userId = ctx.user.id;

            const notifications = await prisma.notifications.findMany({
                where: { userId },
                take: limit + 1,
                cursor: cursor ? { id: cursor } : undefined,
                skip: cursor ? 1 : 0,
                orderBy: { createdAt: "desc" },
                include: {
                    user_notifications_actorIdTouser: {
                        select: {
                            id: true,
                            name: true,
                            image: true,
                        },
                    },
                },
            });

            let nextCursor: string | null = null;
            if (notifications.length > limit) {
                const nextItem = notifications.pop();
                nextCursor = nextItem?.id || null;
            }

            return {
                items: notifications,
                nextCursor,
            };
        }),

    getUnreadCount: protectedProcedure.query(async ({ ctx }) => {
        return NotificationService.getUnreadCount(ctx.user.id);
    }),

    markRead: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            return NotificationService.markAsRead(input.id, ctx.user.id);
        }),

    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
        return NotificationService.markAllAsRead(ctx.user.id);
    }),

    onNotification: protectedProcedure.subscription(async function* ({ ctx }) {
        const userId = ctx.user.id;
        const channel = NotificationService.getChannel(userId);

        console.log(`[TRPC] 🎧 Client subscribing to ${channel}`);

        try {
            for await (const [message] of on(
                redisSubscriptionManager,
                channel,
            )) {
                // In a real app, you might want to validate 'message' schema here
                yield message;
            }
        } catch (err) {
            console.error(`[TRPC] Subscription error on ${channel}`, err);
        }
    }),
});
