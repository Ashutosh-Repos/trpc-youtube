"use server";

import prisma from "@/lib/prisma";
import { getSessionUser } from "./user";
import { ActionResponse, createErrorResponse } from "./schema-types";

// =============================================================================
// TYPES
// =============================================================================

export interface NotificationData {
    id: string;
    type: string;
    title: string;
    message: string;
    isRead: boolean;
    createdAt: Date;
    thumbnailUrl: string | null;
    actionUrl: string | null;
    actor: {
        id: string;
        name: string;
        image: string | null;
    } | null;
}

export interface NotificationResponse {
    notifications: NotificationData[];
    unreadCount: number;
    nextCursor?: string;
}

// =============================================================================
// ACTIONS
// =============================================================================

/**
 * Get user's notifications with pagination
 */
export async function getNotifications(
    cursor?: string,
    limit = 20,
): Promise<ActionResponse<NotificationResponse>> {
    const user = await getSessionUser();
    if (!user) {
        return createErrorResponse("UNAUTHORIZED", "Login required", 401);
    }

    try {
        // Parallel fetch: notifications + unread count
        const [notifications, unreadCount] = await Promise.all([
            prisma.notification.findMany({
                where: { userId: user.id },
                orderBy: { createdAt: "desc" },
                take: limit,
                cursor: cursor ? { id: cursor } : undefined,
                skip: cursor ? 1 : 0,
                include: {
                    actor: {
                        select: {
                            id: true,
                            name: true,
                            image: true,
                        },
                    },
                },
            }),
            prisma.notification.count({
                where: {
                    userId: user.id,
                    isRead: false,
                },
            }),
        ]);

        const formattedNotifications = notifications.map((n) => ({
            id: n.id,
            type: n.type,
            title: n.title,
            message: n.message,
            isRead: n.isRead,
            createdAt: n.createdAt,
            thumbnailUrl: n.thumbnailUrl,
            actionUrl: n.actionUrl,
            actor: n.actor,
        }));

        return {
            success: true,
            data: {
                notifications: formattedNotifications,
                unreadCount,
                nextCursor:
                    notifications.length === limit
                        ? notifications[notifications.length - 1].id
                        : undefined,
            },
        };
    } catch (error) {
        console.error("[Notifications] Fetch error:", error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to fetch notifications",
        );
    }
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(): Promise<
    ActionResponse<{ count: number }>
> {
    const user = await getSessionUser();
    if (!user) return { success: true, data: { count: 0 } };

    try {
        const count = await prisma.notification.count({
            where: {
                userId: user.id,
                isRead: false,
            },
        });
        return { success: true, data: { count } };
    } catch (error) {
        return createErrorResponse("INTERNAL_ERROR", "Failed to count unread");
    }
}

/**
 * Mark a single notification as read
 */
export async function markNotificationAsRead(
    notificationId: string,
): Promise<ActionResponse<void>> {
    const user = await getSessionUser();
    if (!user) {
        return createErrorResponse("UNAUTHORIZED", "Login required", 401);
    }

    try {
        await prisma.notification.update({
            where: {
                id: notificationId,
                userId: user.id, // Security check: ensure ownership
            },
            data: { isRead: true, readAt: new Date() },
        });

        return { success: true, data: undefined };
    } catch (error) {
        console.error("[Notifications] Mark read error:", error);
        return createErrorResponse("INTERNAL_ERROR", "Failed to mark as read");
    }
}

/**
 * Mark all notifications as read
 */
export async function markAllNotificationsAsRead(): Promise<
    ActionResponse<void>
> {
    const user = await getSessionUser();
    if (!user) {
        return createErrorResponse("UNAUTHORIZED", "Login required", 401);
    }

    try {
        await prisma.notification.updateMany({
            where: {
                userId: user.id,
                isRead: false,
            },
            data: { isRead: true, readAt: new Date() },
        });

        return { success: true, data: undefined };
    } catch (error) {
        console.error("[Notifications] Mark all read error:", error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to mark all as read",
        );
    }
}
