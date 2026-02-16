import { router, protectedProcedure, channelOwnerProcedure } from "../trpc";
import prisma from "../../lib/prisma";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "../../../generated/prisma/client";

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
        await prisma.channels.delete({
            where: { id: ctx.channel.id },
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

            return await prisma.$transaction(async (tx) => {
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
                    await tx.channels.update({
                        where: { id: channelId },
                        data: { subscriberCount: { increment: 1 } },
                    });
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

    getChannelByHandle: protectedProcedure
        .input(
            z.object({
                handle: z.string().min(3).max(30).regex(channelHandleRegex),
            }),
        )
        .query(async ({ input }) => {
            const { handle } = input;
            const channel = await prisma.channels.findUnique({
                where: { handle },
                select: CHANNEL_PUBLIC_SELECT,
            });

            if (!channel) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Channel not found",
                });
            }
            return { success: true, channel };
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
});
