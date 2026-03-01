import { z } from "zod";
import { router, publicProcedure } from "../trpc";
import { prisma } from "../../lib/prisma";

export const searchRouter = router({
    globalSearch: publicProcedure
        .input(
            z.object({
                query: z.string().min(1),
                cursor: z.string().nullish(), // Video ID for offset
                limit: z.number().min(1).max(50).default(20),
            }),
        )
        .query(async ({ input, ctx }) => {
            const { query, cursor, limit } = input;

            const cleanedQuery = query.trim();
            if (!cleanedQuery) {
                return {
                    channels: [],
                    playlists: [],
                    items: [],
                    nextCursor: undefined,
                };
            }

            // Format for Postgres tsquery (Lexemes separated by AND operator with Prefix matching)
            const formattedQuery = cleanedQuery
                .split(/\s+/)
                .map((word) => `${word}:*`)
                .join(" & ");

            type SearchChannel = {
                id: string;
                name: string;
                handle: string;
                image: string | null;
                subscriberCount: number;
                videoCount: number;
                isSubscribed: boolean;
            };

            type SearchPlaylist = {
                id: string;
                title: string;
                thumbnailUrl: string | null;
                videoCount: number;
                updatedAt: string;
                channels: {
                    id: string;
                    name: string | null;
                    handle: string | null;
                    image: string | null;
                } | null;
            };

            let fetchedChannels: SearchChannel[] = [];
            let fetchedPlaylists: SearchPlaylist[] = [];

            if (!cursor) {
                const [channelsList, playlistsList] = await Promise.all([
                    prisma.channels.findMany({
                        where: {
                            status: "ACTIVE",
                            OR: [
                                {
                                    name: {
                                        search: formattedQuery,
                                    },
                                },
                                {
                                    handle: {
                                        search: formattedQuery,
                                    },
                                },
                            ],
                        },
                        take: 2,
                        orderBy: { subscriberCount: "desc" },
                        select: {
                            id: true,
                            name: true,
                            handle: true,
                            image: true,
                            subscriberCount: true,
                            videoCount: true,
                        },
                    }),
                    prisma.playlists.findMany({
                        where: {
                            visibility: "PUBLIC",
                            title: { search: formattedQuery },
                        },
                        take: 3,
                        orderBy: { videoCount: "desc" },
                        select: {
                            id: true,
                            title: true,
                            thumbnailUrl: true,
                            videoCount: true,
                            updatedAt: true,
                            channels: {
                                select: {
                                    id: true,
                                    name: true,
                                    handle: true,
                                    image: true,
                                },
                            },
                        },
                    }),
                ]);

                if (ctx.user?.id && channelsList.length > 0) {
                    const subscriptions = await prisma.subscriptions.findMany({
                        where: {
                            subscriberId: ctx.user.id,
                            channelId: { in: channelsList.map((c) => c.id) },
                        },
                    });
                    const subSet = new Set(
                        subscriptions.map((s) => s.channelId),
                    );
                    fetchedChannels = channelsList.map((c) => ({
                        ...c,
                        isSubscribed: subSet.has(c.id),
                    }));
                } else {
                    fetchedChannels = channelsList.map((c) => ({
                        ...c,
                        isSubscribed: false,
                    }));
                }
                fetchedPlaylists = playlistsList.map((p) => ({
                    ...p,
                    updatedAt: p.updatedAt.toISOString(),
                }));
            }

            // Prisma text search fallback (Can be upgraded to Raw SQL tsvector proxy)
            const videos = await prisma.videos.findMany({
                where: {
                    visibility: "PUBLIC",
                    processingStatus: "READY",
                    deletedAt: null,
                    OR: [
                        { title: { search: formattedQuery } },
                        {
                            description: {
                                search: formattedQuery,
                            },
                        },
                    ],
                },
                take: limit + 1,
                cursor: cursor ? { id: cursor } : undefined,
                orderBy: [
                    { engagementScore: "desc" }, // Quality filter
                    { viewCount: "desc" }, // Popularity fallback
                    { id: "asc" }, // Deterministic order for cursor
                ],
                select: {
                    id: true,
                    title: true,
                    thumbnailUrl: true,
                    previewSprite: true,
                    channelId: true,
                    channels: {
                        select: {
                            name: true,
                            handle: true,
                            image: true,
                            subscriberCount: true,
                        },
                    },
                    viewCount: true,
                    createdAt: true,
                    duration: true,
                    isShort: true,
                },
            });

            let nextCursor: typeof cursor | undefined = undefined;
            if (videos.length > limit) {
                const nextItem = videos.pop();
                nextCursor = nextItem!.id;
            }

            return {
                channels: fetchedChannels,
                playlists: fetchedPlaylists,
                items: videos.map((v) => ({
                    id: v.id,
                    title: v.title,
                    thumbnailUrl: v.thumbnailUrl,
                    channelId: v.channelId,
                    channels: {
                        id: v.channelId,
                        name: v.channels?.name || null,
                        handle: v.channels?.handle || null,
                        image: v.channels?.image || null,
                        subscriberCount: v.channels?.subscriberCount || 0,
                    },
                    viewCount: v.viewCount,
                    createdAt: v.createdAt.toISOString(),
                    duration: v.duration,
                    isShort: v.isShort,
                })),
                nextCursor,
            };
        }),
});
