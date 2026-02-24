"use server";

import prisma from "@/lib/prisma";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import {
    ActionResponse,
    createChannelSchema,
    CreateChannelType,
    handleRegex,
    updateChannelSchema,
    UpdateChannelType,
    createErrorResponse,
    linkSchema,
    featureFlagsSchema,
} from "./schema-types";
import { getSessionUser } from "./user";

const CHANNEL_PUBLIC_SELECT = {
    id: true,
    userId: true, // Needed for playlist filtering
    handle: true,
    name: true,
    description: true,
    image: true,
    bannerUrl: true,
    isVerified: true,
    subscriberCount: true,
    videoCount: true,
    totalViews: true,
    createdAt: true,
    links: true,
    location: true,
    contactEmail: true,
    featureFlags: true,
};

export type PublicChannel = {
    id: string;
    userId: string;
    handle: string;
    name: string;
    description: string | null;
    image: string | null;
    bannerUrl: string | null;
    isVerified: boolean;
    subscriberCount: number;
    videoCount: number;
    totalViews: number;
    createdAt: Date;
    links: z.infer<typeof linkSchema>[] | Prisma.JsonValue;
    location: string | null;
    contactEmail: string | null;
    featureFlags: z.infer<typeof featureFlagsSchema> | Prisma.JsonValue;
};

const getChannelInternal = async (
    identifier: string,
): Promise<PublicChannel | null> => {
    // First try to find by handle (most common case)
    let channel = await prisma.channels.findFirst({
        where: {
            handle: identifier,
            deletedAt: null,
        },
        select: CHANNEL_PUBLIC_SELECT,
    });

    // If not found by handle, try by id (fallback for old VideoCards with channelId)
    if (!channel) {
        channel = await prisma.channels.findFirst({
            where: {
                id: identifier,
                deletedAt: null,
            },
            select: CHANNEL_PUBLIC_SELECT,
        });
    }

    return channel as PublicChannel | null;
};

const getCachedChannel = unstable_cache(
    async (handle: string) => getChannelInternal(handle),
    ["channel-by-handle"],
    { tags: ["channel"], revalidate: 3600 }, // 1 hour TTL by default
);

export async function getChannel(
    handle: string,
): Promise<ActionResponse<PublicChannel>> {
    try {
        const channel = await getCachedChannel(handle);

        if (!channel)
            return createErrorResponse("NOT_FOUND", "Channel not found", 404);
        return { success: true, data: channel };
    } catch (error) {
        console.error(`[Channel] Get cached failed:`, error);
        return createErrorResponse("INTERNAL_ERROR", "Failed to fetch channel");
    }
}

export async function checkHandleAvailability(
    handle: string,
): Promise<ActionResponse<{ available: boolean }>> {
    try {
        if (!handleRegex.test(handle) || handle.length < 3) {
            return { success: true, data: { available: false } };
        }

        const existing = await prisma.channels.findUnique({
            where: { handle },
            select: { id: true },
        });

        return { success: true, data: { available: !existing } };
    } catch {
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Availability check failed",
        );
    }
}

export async function getUserChannels(): Promise<
    ActionResponse<PublicChannel[]>
> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return createErrorResponse("UNAUTHORIZED", "Login required", 401);
        }

        const channels = await prisma.channels.findMany({
            where: {
                userId: user.id,
                deletedAt: null,
            },
            orderBy: {
                createdAt: "desc",
            },
            select: CHANNEL_PUBLIC_SELECT,
        });

        const safeData = JSON.parse(JSON.stringify(channels));
        return { success: true, data: safeData };
    } catch (error) {
        console.error(`[Channel] List failed:`, error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            error instanceof Error ? error.message : "Failed to list channels",
        );
    }
}

export async function getChannelById(
    channelId: string,
): Promise<ActionResponse<PublicChannel & { tags: { name: string }[] }>> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return createErrorResponse("UNAUTHORIZED", "Login required", 401);
        }

        const channel = await prisma.channels.findUnique({
            where: {
                id: channelId,
                deletedAt: null,
            },
            include: {
                tags: {
                    select: { name: true },
                },
            },
        });

        if (!channel) {
            return createErrorResponse("NOT_FOUND", "Channel not found", 404);
        }

        if (channel.userId !== user.id) {
            return createErrorResponse("FORBIDDEN", "Access denied", 403);
        }

        const safeData = JSON.parse(JSON.stringify(channel));
        return { success: true, data: safeData };
    } catch (error) {
        console.error(`[Channel] GetById failed:`, error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            error instanceof Error ? error.message : "Failed to fetch channel",
        );
    }
}

export async function createChannel(
    data: CreateChannelType,
): Promise<ActionResponse<PublicChannel>> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return createErrorResponse("UNAUTHORIZED", "Login required", 401);
        }

        const validData = createChannelSchema.parse(data);

        const existing = await prisma.channels.findUnique({
            where: { handle: validData.handle },
        });

        if (existing) {
            return createErrorResponse(
                "HANDLE_TAKEN",
                "Handle is already taken",
            );
        }

        const channel = await prisma.channels.create({
            data: {
                userId: user.id,
                ...validData,
                status: "ACTIVE",
            },
            select: CHANNEL_PUBLIC_SELECT,
        });

        revalidatePath("/studio");

        const safeData = JSON.parse(JSON.stringify(channel));
        return { success: true, data: safeData };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return createErrorResponse(
                "VALIDATION_ERROR",
                error.issues[0].message,
            );
        }
        console.error(`[Channel] Create failed:`, error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            error instanceof Error ? error.message : "Failed to create channel",
        );
    }
}

export async function updateChannel(
    channelId: string,
    data: Partial<UpdateChannelType>,
): Promise<ActionResponse<PublicChannel & { tags?: { name: string }[] }>> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return createErrorResponse("UNAUTHORIZED", "Login required", 401);
        }

        const validData = updateChannelSchema.parse(data);

        const existing = await prisma.channels.findUnique({
            where: { id: channelId },
            select: { id: true, userId: true, handle: true, deletedAt: true },
        });

        if (!existing || existing.deletedAt) {
            return createErrorResponse("NOT_FOUND", "Channel not found", 404);
        }

        if (existing.userId !== user.id) {
            return createErrorResponse("FORBIDDEN", "Access denied", 403);
        }

        // Handle collision check if moving to a new handle
        if (validData.handle && validData.handle !== existing.handle) {
            const collision = await prisma.channels.findUnique({
                where: { handle: validData.handle },
            });
            if (collision) {
                return createErrorResponse(
                    "HANDLE_TAKEN",
                    "Handle is already taken",
                );
            }
        }

        const { tags, featureFlags, ...scalarData } = validData;

        const channel = await prisma.channels.update({
            where: { id: existing.id },
            data: {
                ...scalarData,
                featureFlags: featureFlags || undefined,
                tags: tags
                    ? {
                          set: [], // Clear existing
                          connectOrCreate: tags.map((name: string) => ({
                              where: { name },
                              create: { name },
                          })),
                      }
                    : undefined,
            },
            select: {
                ...CHANNEL_PUBLIC_SELECT,
                tags: {
                    select: { name: true },
                },
            },
        });

        // Revalidate paths and tags
        try {
            revalidateTag(`channel:${channel.id}`, "default");
            revalidateTag("channel", "default"); // Global channel list tag
            revalidatePath(`/channel/${existing.handle}`);
            revalidatePath(`/channel/${existing.handle}/about`);
            if (validData.handle && validData.handle !== existing.handle) {
                revalidatePath(`/channel/${validData.handle}`);
                revalidatePath(`/channel/${validData.handle}/about`);
            }
            revalidatePath(`/studio/${channel.id}/settings`);
        } catch (revalidateError) {
            console.error(`[Channel] Revalidation warning:`, revalidateError);
            // Don't fail the whole update just because revalidation failed
        }

        // Deep copy/serialize to ensure no non-POJOs escape
        const safeData = JSON.parse(JSON.stringify(channel));
        return { success: true, data: safeData };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return createErrorResponse(
                "VALIDATION_ERROR",
                error.issues[0].message,
            );
        }
        console.error(`[Channel] Update critical failure:`, error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            error instanceof Error ? error.message : "Failed to update channel",
        );
    }
}

export async function deleteChannel(
    handle: string,
): Promise<ActionResponse<{ message: string }>> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return createErrorResponse("UNAUTHORIZED", "Login required", 401);
        }

        const existing = await prisma.channels.findUnique({
            where: { handle },
            select: { id: true, userId: true },
        });

        if (!existing) {
            return createErrorResponse("NOT_FOUND", "Channel not found", 404);
        }
        if (existing.userId !== user.id) {
            return createErrorResponse("FORBIDDEN", "Access denied", 403);
        }

        await prisma.channels.update({
            where: { id: existing.id },
            data: {
                deletedAt: new Date(),
                status: "TERMINATED",
            },
        });

        revalidatePath("/channels");
        revalidatePath(`/channel/${handle}`);

        return {
            success: true,
            data: { message: "Channel deleted successfully" },
        };
    } catch (error) {
        console.error(`[Channel] Delete failed:`, error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            error instanceof Error ? error.message : "Failed to delete channel",
        );
    }
}

/**
 * Toggle subscription to a channel
 */
export async function toggleSubscription(
    channelId: string,
): Promise<ActionResponse<string>> {
    const user = await getSessionUser();
    if (!user)
        return createErrorResponse("UNAUTHORIZED", "Login to subscribe", 401);

    try {
        const result = await prisma.$transaction(async (tx) => {
            const existing = await tx.subscriptions.findUnique({
                where: {
                    subscriberId_channelId: {
                        subscriberId: user.id,
                        channelId,
                    },
                },
            });

            if (existing) {
                // Unsubscribe
                await tx.subscriptions.delete({ where: { id: existing.id } });
                await tx.channels.update({
                    where: { id: channelId },
                    data: { subscriberCount: { decrement: 1 } },
                });
                return "UNSUBSCRIBED";
            } else {
                // Subscribe
                await tx.subscriptions.create({
                    data: { subscriberId: user.id, channelId },
                });
                await tx.channels.update({
                    where: { id: channelId },
                    data: { subscriberCount: { increment: 1 } },
                });
                return "SUBSCRIBED";
            }
        });

        revalidatePath(`/channel/${channelId}`);
        return { success: true, data: result };
    } catch {
        return createErrorResponse(
            "SERVER_ERROR",
            "Failed to toggle subscription",
        );
    }
}

/**
 * Check if user is subscribed to a channel
 */
export async function isSubscribed(channelId: string): Promise<boolean> {
    const user = await getSessionUser();
    if (!user) return false;

    const sub = await prisma.subscriptions.findUnique({
        where: { subscriberId_channelId: { subscriberId: user.id, channelId } },
        select: { id: true },
    });

    return !!sub;
}
