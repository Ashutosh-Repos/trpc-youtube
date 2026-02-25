import { z } from "zod";
import { router, protectedProcedure } from "../trpc";
import { NotificationService } from "../../services/NotificationService";
import { redisSubscriptionManager } from "../../lib/ws/redisSubscription";
import { on } from "events";
import prisma from "../../lib/prisma";

// Filter tab → NotificationType mapping (YouTube-style)
const TYPE_FILTER_MAP: Record<string, string[]> = {
    uploads: ["NEW_VIDEO"],
    comments: ["COMMENT", "COMMENT_REPLY"],
    activity: [
        "NEW_SUBSCRIBER",
        "VIDEO_LIKE",
        "COMMENT_LIKE",
        "LIVE_STARTED",
        "LIVE_SCHEDULED",
        "SYSTEM",
    ],
};

export const notificationRouter = router({
    list: protectedProcedure
        .input(
            z.object({
                limit: z.number().min(1).max(50).default(20),
                cursor: z.string().nullish(),
                typeFilter: z
                    .enum(["all", "uploads", "comments", "activity"])
                    .default("all"),
            }),
        )
        .query(async ({ ctx, input }) => {
            const { limit, cursor, typeFilter } = input;
            const userId = ctx.user.id;

            // Build type filter
            const typeCondition =
                typeFilter !== "all" && TYPE_FILTER_MAP[typeFilter]
                    ? { type: { in: TYPE_FILTER_MAP[typeFilter] as any } }
                    : {};

            const notifications = await prisma.notifications.findMany({
                where: { userId, isHidden: false, ...typeCondition },
                take: limit + 1,
                cursor: cursor ? { id: cursor } : undefined,
                skip: cursor ? 1 : 0,
                orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
        return prisma.notifications.count({
            where: { userId: ctx.user.id, isRead: false, isHidden: false },
        });
    }),

    markRead: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            return NotificationService.markAsRead(input.id, ctx.user.id);
        }),

    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
        return NotificationService.markAllAsRead(ctx.user.id);
    }),

    // Soft-delete (dismiss): hides from list but keeps in DB for analytics
    delete: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const result = await prisma.notifications.updateMany({
                where: { id: input.id, userId: ctx.user.id },
                data: { isHidden: true },
            });
            return { success: result.count > 0 };
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
                yield message;
            }
        } catch (err) {
            console.error(`[TRPC] Subscription error on ${channel}`, err);
        }
    }),
});
