import {
    router,
    publicProcedure,
    protectedProcedure,
    channelOwnerProcedure,
} from "../trpc";
import prisma from "../../lib/prisma";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "../../../generated/prisma/client";
import { NotificationService } from "../../services/NotificationService";

const channelHandleRegex = /^[a-zA-Z0-9_.]+$/;
const linkSchema = z.object({
    title: z.string().trim().min(1).max(100),
    url: z.url(),
});

export const createChannelSchema = z.object({
    name: z.string().trim().min(1).max(50),
    handle: z
        .string()
        .trim()
        .min(3)
        .max(30)
        .regex(
            channelHandleRegex,
            "Handle can only contain letters, numbers, underscores, and periods.",
        ),
    description: z.string().trim().max(5000).optional(),
    image: z.string().optional(),
    bannerUrl: z.string().optional(),
    contactEmail: z.email().optional(),
    location: z.string().trim().max(100).optional(),
    links: z.array(linkSchema).max(20).optional(),
    tags: z.array(z.string().trim()).max(50).optional(),
});

const CHANNEL_PUBLIC_SELECT = {
    id: true,
    userId: true,
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
} satisfies Prisma.channelsSelect;

export const channelRouter = router({
    createChannel: protectedProcedure
        .input(createChannelSchema)
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.user.id;
            const { tags, ...scalarInput } = input;

            try {
                const channel = await prisma.channels.create({
                    data: {
                        ...scalarInput,
                        userId,
                        status: "ACTIVE",
                        tags: tags
                            ? {
                                  connectOrCreate: tags.map((tag) => ({
                                      where: { name: tag },
                                      create: { name: tag },
                                  })),
                              }
                            : undefined,
                    },
                });
                return { success: true, channel };
            } catch (error) {
                if (
                    error instanceof Prisma.PrismaClientKnownRequestError &&
                    error.code === "P2002"
                ) {
                    throw new TRPCError({
                        code: "CONFLICT",
                        message: "This handle is already taken.",
                    });
                }
                throw error;
            }
        }),

    updateChannel: channelOwnerProcedure
        .input(
            createChannelSchema
                .extend({
                    featureFlags: z
                        .object({
                            canLiveStream: z.boolean().optional(),
                            canUpload: z.boolean().optional(),
                        })
                        .optional(),
                })
                .partial(),
        )
        .mutation(async ({ ctx, input }) => {
            const { tags, channelId: _channelId, ...data } = input;
            const channelId = ctx.channel.id;

            // Calculate Tag Deltas
            let tagsUpdateOp = undefined;
            if (tags) {
                // If tags are being updated, we need to fetch existing tags
                // channelOwnerProcedure does NOT include tags by default
                const existingWithTags = await prisma.channels.findUnique({
                    where: { id: channelId },
                    select: { tags: true },
                });

                // Should exist because we just checked ownership
                if (existingWithTags) {
                    const currentTagNames = existingWithTags.tags.map(
                        (t) => t.name,
                    );
                    const newTagNames = tags;

                    const tagsToConnect = newTagNames.filter(
                        (t) => !currentTagNames.includes(t),
                    );
                    const tagsToDisconnect = currentTagNames.filter(
                        (t) => !newTagNames.includes(t),
                    );

                    if (
                        tagsToConnect.length > 0 ||
                        tagsToDisconnect.length > 0
                    ) {
                        tagsUpdateOp = {
                            disconnect: tagsToDisconnect.map((tag) => ({
                                name: tag,
                            })),
                            connectOrCreate: tagsToConnect.map((tag) => ({
                                where: { name: tag },
                                create: { name: tag },
                            })),
                        };
                    }
                }
            }

            try {
                const channel = await prisma.channels.update({
                    where: { id: channelId },
                    data: {
                        ...data,
                        tags: tagsUpdateOp,
                    },
                });
                return { success: true, channel };
            } catch (error) {
                if (
                    error instanceof Prisma.PrismaClientKnownRequestError &&
                    error.code === "P2002"
                ) {
                    throw new TRPCError({
                        code: "CONFLICT",
                        message: "This handle is already taken.",
                    });
                }
                throw error;
            }
        }),

    deleteChannel: channelOwnerProcedure.mutation(async ({ ctx }) => {
        // Soft-delete: preserves all video records and analytics.
        // A background job should later clean up associated S3 objects.
        await prisma.channels.update({
            where: { id: ctx.channel.id },
            data: {
                deletedAt: new Date(),
                status: "SUSPENDED",
            },
        });
        return { success: true };
    }),

    toggleSubscription: protectedProcedure
        .input(
            z.object({
                channelId: z.string({ message: "Channel ID is required" }),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { channelId } = input;
            const userId = ctx.user.id;

            // TODO: For high scale (>1M users), refrain from writing to DB directly.
            // Instead, push to a Redis queue and process in background (Write-Behind).
            return await prisma.$transaction(async (tx) => {
                const channelInfo = await tx.channels.findUnique({
                    where: { id: channelId },
                    select: { userId: true, handle: true, name: true },
                });

                if (!channelInfo) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Channel not found",
                    });
                }

                if (channelInfo.userId === userId) {
                    throw new TRPCError({
                        code: "BAD_REQUEST",
                        message: "You cannot subscribe to your own channel",
                    });
                }

                const existing = await tx.subscriptions.findUnique({
                    where: {
                        subscriberId_channelId: {
                            subscriberId: userId,
                            channelId,
                        },
                    },
                });

                if (existing) {
                    await tx.subscriptions.delete({
                        where: { id: existing.id },
                    });

                    await tx.channels.update({
                        where: { id: channelId },
                        data: { subscriberCount: { decrement: 1 } },
                    });
                    return { success: true, action: "UNSUBSCRIBED" };
                } else {
                    await tx.subscriptions.create({
                        data: { subscriberId: userId, channelId },
                    });
                    const channel = await tx.channels.update({
                        where: { id: channelId },
                        data: { subscriberCount: { increment: 1 } },
                        select: { userId: true, handle: true, name: true },
                    });

                    // Fire NEW_SUBSCRIBER notification to channel owner (async, non-blocking)
                    NotificationService.notify({
                        userId: channel.userId,
                        actorId: userId,
                        type: "NEW_SUBSCRIBER",
                        title: "New Subscriber",
                        message: "subscribed to your channel",
                        channelId,
                        actionUrl: `/@${channel.handle}`,
                        groupKey: `NEW_SUBSCRIBER:${channelId}:${new Date().toISOString().slice(0, 10)}`,
                    }).catch(console.error);

                    return { success: true, action: "SUBSCRIBED" };
                }
            });
        }),

    checkHandleAvailability: protectedProcedure
        .input(
            z.object({
                handle: z.string().min(3).max(30).regex(channelHandleRegex),
            }),
        )
        .query(async ({ input }) => {
            const { handle } = input;
            const existing = await prisma.channels.findUnique({
                where: { handle },
                select: { id: true },
            });
            return { success: !existing };
        }),

    getChannelByHandle: publicProcedure
        .input(
            z.object({
                handle: z.string().min(3).max(30).regex(channelHandleRegex),
            }),
        )
        .query(async ({ ctx, input }) => {
            const { handle } = input;
            const channel = await prisma.channels.findUnique({
                where: { handle, deletedAt: null },
                select: CHANNEL_PUBLIC_SELECT,
            });

            if (!channel) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Channel not found",
                });
            }

            let isSubscribed = false;
            let notificationLevel: "ALL" | "PERSONALIZED" | "NONE" =
                "PERSONALIZED";

            if (ctx.user?.id) {
                const sub = await prisma.subscriptions.findUnique({
                    where: {
                        subscriberId_channelId: {
                            subscriberId: ctx.user.id,
                            channelId: channel.id,
                        },
                    },
                    select: { notificationLevel: true },
                });
                if (sub) {
                    isSubscribed = true;
                    notificationLevel = sub.notificationLevel;
                }
            }

            return {
                success: true,
                channel,
                isSubscribed,
                notificationLevel,
            };
        }),

    getChannelById: channelOwnerProcedure.query(async ({ ctx }) => {
        const channel = await prisma.channels.findUnique({
            where: { id: ctx.channel.id },
            include: { tags: true },
        });

        if (!channel) {
            throw new TRPCError({
                code: "NOT_FOUND",
                message: "Channel not found",
            });
        }

        return { success: true, channel };
    }),

    getUserChannels: protectedProcedure.query(async ({ ctx }) => {
        const userId = ctx.user.id;
        const channelsData = await prisma.channels.findMany({
            where: {
                userId,
                deletedAt: null,
            },
            orderBy: {
                createdAt: "desc",
            },
            include: {
                _count: {
                    select: {
                        videos: {
                            where: {
                                deletedAt: null,
                            },
                        },
                    },
                },
            },
        });

        // Map to public shape but use dynamic video count
        const channels = channelsData.map((channel) => ({
            id: channel.id,
            userId: channel.userId,
            handle: channel.handle,
            name: channel.name,
            description: channel.description,
            image: channel.image,
            bannerUrl: channel.bannerUrl,
            isVerified: channel.isVerified,
            subscriberCount: channel.subscriberCount,
            videoCount: channel._count.videos, // Use real count
            totalViews: channel.totalViews,
            createdAt: channel.createdAt,
            links: channel.links,
            location: channel.location,
            contactEmail: channel.contactEmail,
            featureFlags: channel.featureFlags,
        }));

        return { success: true, channels };
    }),

    // Per-channel notification bell: get current level
    getNotificationLevel: protectedProcedure
        .input(z.object({ channelId: z.string() }))
        .query(async ({ ctx, input }) => {
            const sub = await prisma.subscriptions.findUnique({
                where: {
                    subscriberId_channelId: {
                        subscriberId: ctx.user.id,
                        channelId: input.channelId,
                    },
                },
                select: { notificationLevel: true },
            });
            return sub?.notificationLevel ?? null;
        }),

    // Per-channel notification bell: update level
    updateNotificationLevel: protectedProcedure
        .input(
            z.object({
                channelId: z.string(),
                level: z.enum(["ALL", "PERSONALIZED", "NONE"]),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const result = await prisma.subscriptions.updateMany({
                where: {
                    subscriberId: ctx.user.id,
                    channelId: input.channelId,
                },
                data: { notificationLevel: input.level },
            });
            return { success: result.count > 0 };
        }),
});
