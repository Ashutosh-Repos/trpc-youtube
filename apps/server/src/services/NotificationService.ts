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
        SYSTEM: undefined, // System notifications cannot be opted out of
    };

    private static locks = new Map<string, Promise<void>>();

    /**
     * Create a notification and publish it via Redis Pub/Sub.
     * Respects user notification_settings — if the user has opted out
     * of this notification type, the notification is silently skipped.
     */
    static async notify(data: {
        userId: string;
        actorId?: string;
        type: NotificationType;
        title: string;
        message: string;
        videoId?: string;
        commentId?: string;
        channelId?: string;
        thumbnailUrl?: string;
        actionUrl?: string;
        metadata?: Record<string, unknown>;
        groupKey?: string;
    }) {
        const lockKey = data.groupKey
            ? `${data.userId}:${data.groupKey}`
            : null;
        if (lockKey) {
            while (this.locks.has(lockKey)) {
                await this.locks.get(lockKey);
            }
            let release: () => void;
            const p = new Promise<void>((resolve) => {
                release = resolve;
            });
            this.locks.set(lockKey, p);

            try {
                await this._notifyInternal(data);
            } finally {
                this.locks.delete(lockKey);
                release!();
            }
        } else {
            await this._notifyInternal(data);
        }
    }

    private static async _notifyInternal(data: {
        userId: string;
        actorId?: string;
        type: NotificationType;
        title: string;
        message: string;
        videoId?: string;
        commentId?: string;
        channelId?: string;
        thumbnailUrl?: string;
        actionUrl?: string;
        metadata?: Record<string, unknown>;
        groupKey?: string;
    }) {
        // Prevent self-notifications
        if (data.actorId && data.actorId === data.userId) return;

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

        // Aggregation: if groupKey provided, try to update an existing recent notification
        if (data.groupKey) {
            try {
                const existing = await prisma.notifications.findFirst({
                    where: {
                        userId: data.userId,
                        groupKey: data.groupKey,
                        createdAt: {
                            gt: new Date(Date.now() - 60 * 60 * 1000), // 1-hour window
                        },
                    },
                    select: { id: true, groupCount: true },
                });

                if (existing) {
                    // Update: increment count, update actor, resurface, and get full data in one trip
                    const updated = await prisma.notifications.update({
                        where: { id: existing.id },
                        data: {
                            groupCount: existing.groupCount + 1,
                            actorId: data.actorId || undefined,
                            isRead: false,
                            readAt: null,
                            createdAt: new Date(), // float to top
                        },
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
                    // Publish real-time update so bell resurfaces the notification
                    try {
                        await redis.publish(
                            this.getChannel(data.userId),
                            JSON.stringify(updated),
                        );
                    } catch {
                        // Non-critical, swallow
                    }
                    return; // Don't create a new notification
                }
            } catch (err) {
                console.warn(
                    "[Notification] Aggregation check failed, creating new",
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
            where: { userId, isRead: false, isHidden: false },
            data: { isRead: true, readAt: new Date() },
        });
    }

    static async getUnreadCount(userId: string) {
        return prisma.notifications.count({
            where: { userId, isRead: false, isHidden: false },
        });
    }

    /**
     * TTL cleanup: delete old notifications to keep the table bounded.
     * - Read notifications older than 30 days
     * - Hidden (dismissed) notifications older than 7 days
     * Call from a daily cron or setInterval in the worker.
     */
    static async cleanupOldNotifications() {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        try {
            const [readResult, hiddenResult] = await prisma.$transaction([
                prisma.notifications.deleteMany({
                    where: {
                        isRead: true,
                        createdAt: { lt: thirtyDaysAgo },
                    },
                }),
                prisma.notifications.deleteMany({
                    where: {
                        isHidden: true,
                        createdAt: { lt: sevenDaysAgo },
                    },
                }),
            ]);
            const total = readResult.count + hiddenResult.count;
            if (total > 0) {
                console.log(
                    `[NotificationCleanup] Deleted ${readResult.count} old read + ${hiddenResult.count} hidden notifications`,
                );
            }
        } catch (err) {
            console.error("[NotificationCleanup] Failed:", err);
        }
    }
}
