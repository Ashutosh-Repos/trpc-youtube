"use server";
import prisma from "@/lib/prisma";
import { z } from "zod";
import { ActionResponse, createErrorResponse } from "./schema-types";
import { getSessionUser } from "./user";

const notificationSettingsSchema = z.object({
    newVideos: z.boolean(),
    liveStreams: z.boolean(),
    comments: z.boolean(),
    replies: z.boolean(),
    likes: z.boolean(),
    subscribers: z.boolean(),
    mentions: z.boolean(),
    emailEnabled: z.boolean(),
    pushEnabled: z.boolean(),
});

export type NotificationSettingsType = z.infer<
    typeof notificationSettingsSchema
>;

export async function getNotificationSettings(): Promise<
    ActionResponse<unknown>
> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return createErrorResponse("UNAUTHORIZED", "Login required", 401);
        }

        let settings = await prisma.notification_settings.findUnique({
            where: {
                userId: user.id,
            },
        });

        if (!settings) {
            settings = await prisma.notification_settings.create({
                data: {
                    userId: user.id,
                },
            });
        }

        return { success: true, data: settings };
    } catch (error) {
        console.error("[Notification Settings] Fetch failed:", error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to fetch settings",
        );
    }
}

export async function updateNotificationSettings(
    data: Partial<NotificationSettingsType>,
): Promise<ActionResponse<unknown>> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return createErrorResponse("UNAUTHORIZED", "Login required", 401);
        }

        // Validate input (partial because we might update one by one)
        const validData = notificationSettingsSchema.partial().parse(data);

        const settings = await prisma.notification_settings.update({
            where: {
                userId: user.id,
            },
            data: validData,
        });

        return { success: true, data: settings };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return createErrorResponse(
                "VALIDATION_ERROR",
                error.issues[0].message,
            );
        }
        console.error("[Notification Settings] Update failed:", error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to update settings",
        );
    }
}
