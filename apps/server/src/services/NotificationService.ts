import prisma from "../lib/prisma";
import redis from "../lib/redis";
import { NotificationType } from "../../generated/prisma/client";

export class NotificationService {
    private static CHANNEL_PREFIX = "user:notifications";

    static getChannel(userId: string) {
        return `${this.CHANNEL_PREFIX}:${userId}`;
    }

    /**
     * Map notification type to the corresponding setting field.
     * YouTube-style: users can opt out of specific notification categories.
     */
    private static SETTING_MAP: Partial<
        Record<
            NotificationType,
            keyof Omit<
                import("../../generated/prisma/client").notification_settings,
                | "id"
                | "userId"
                | "createdAt"
                | "updatedAt"
                | "user"
                | "emailEnabled"
                | "pushEnabled"
            >
        >
    > = {
        NEW_VIDEO: "newVideos",
        COMMENT: "comments",
        COMMENT_REPLY: "replies",
        COMMENT_LIKE: "likes",
        VIDEO_LIKE: "likes",
        NEW_SUBSCRIBER: "subscribers",
        LIVE_STARTED: "liveStreams",
        LIVE_SCHEDULED: "liveStreams",
    };

    /**
     * Create a notification and publish it via Redis Pub/Sub.
     * Respects user notification_settings — if the user has opted out
     * of this notification type, the notification is silently skipped.
     */
    static async notify(data: {
        userId: string;
        actorId: string;
        type: NotificationType;
        title: string;
        message: string;
        videoId?: string;
        commentId?: string;
        channelId?: string;
        thumbnailUrl?: string;
        actionUrl?: string;
    }) {
        // Check user notification settings (YouTube-style opt-out)
        const settingField = this.SETTING_MAP[data.type];
        if (settingField) {
            try {
                const settings = await prisma.notification_settings.findUnique({
                    where: { userId: data.userId },
                    select: { [settingField]: true },
                });
                // If settings exist and the user has explicitly disabled this type, skip
                if (settings && settings[settingField] === false) {
                    return;
                }
            } catch (err) {
                // If settings lookup fails, send the notification anyway (fail-open)
                console.warn(
                    "[Notification] Failed to check settings, sending anyway",
                    err,
                );
            }
        }

        // Publish to Stream for Background Worker (Batch Insert)
        try {
            await redis.xadd(
                "queue:notifications",
                "*",
                "data",
                JSON.stringify(data),
            );
        } catch (err) {
            console.error("[Notification] Failed to queue notification", err);
        }
    }

    static async markAsRead(notificationId: string, userId: string) {
        const result = await prisma.notifications.updateMany({
            where: { id: notificationId, userId },
            data: { isRead: true, readAt: new Date() },
        });
        return { success: result.count > 0 };
    }

    static async markAllAsRead(userId: string) {
        return prisma.notifications.updateMany({
            where: { userId, isRead: false },
            data: { isRead: true, readAt: new Date() },
        });
    }

    static async getUnreadCount(userId: string) {
        return prisma.notifications.count({
            where: { userId, isRead: false },
        });
    }
}
