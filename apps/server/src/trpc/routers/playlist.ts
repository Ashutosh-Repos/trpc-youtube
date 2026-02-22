import {
    router,
    protectedProcedure,
    playlistOwnerProcedure,
    channelOwnerProcedure,
    publicProcedure,
} from "../trpc";
import prisma from "../../lib/prisma";
import z from "zod";
import { TRPCError } from "@trpc/server";

const videoVisibilitySchema = z.enum([
    "PUBLIC",
    "PRIVATE",
    "UNLISTED",
    "SCHEDULED",
]);

const playlistSchema = z.object({
    title: z.string().trim().min(1, "Title is required").max(150),
    description: z.string().trim().max(5000).optional(),
    channelId: z.string({ message: "Channel ID is required" }).optional(),
    visibility: videoVisibilitySchema.default("UNLISTED"),
});

export const playlistRouter = router({
    createPlaylist: protectedProcedure
        .input(playlistSchema.omit({ visibility: true }))
        .mutation(async ({ ctx, input }) => {
            const { title, description, channelId } = input;
            const userId = ctx.user.id;
            let finalVisibility: "PUBLIC" | "PRIVATE" | "UNLISTED" = "UNLISTED";

            // If channelId is provided, verify ownership
            if (channelId) {
                const channel = await prisma.channels.findUnique({
                    where: { id: channelId },
                });

                if (!channel) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Channel not found",
                    });
                }

                if (channel.userId !== userId) {
                    throw new TRPCError({
                        code: "FORBIDDEN",
                        message: "You do not own this channel",
                    });
                }
            } else {
                // User-managed playlist (no channel) -> Always PRIVATE
                finalVisibility = "PRIVATE";
            }

            const playlist = await prisma.playlists.create({
                data: {
                    title,
                    description,
                    channelId: channelId || null,
                    userId,
                    visibility: finalVisibility,
                },
            });

            return { success: true, playlist };
        }),

    updatePlaylist: playlistOwnerProcedure
        .input(
            playlistSchema
                .extend({
                    playlistId: z.string({
                        message: "Playlist ID is required",
                    }),
                })
                .partial()
                .required({ playlistId: true }),
        )
        .mutation(async ({ ctx, input }) => {
            const { playlistId, channelId, ...data } = input;
            const { playlist } = ctx;

            // Ensure playlist belongs to the specified channel (if valid channelId provided)
            if (
                channelId &&
                playlist.channelId &&
                playlist.channelId !== channelId
            ) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message:
                        "Playlist does not belong to the specified channel",
                });
            }

            // User-managed playlists (no channel) must remain PRIVATE
            if (
                !playlist.channelId &&
                data.visibility &&
                data.visibility !== "PRIVATE"
            ) {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: "User-managed playlists must be private",
                });
            }

            const updatedPlaylist = await prisma.playlists.update({
                where: { id: playlist.id },
                data: {
                    ...data,
                },
            });

            return { success: true, playlist: updatedPlaylist };
        }),

    deletePlaylist: playlistOwnerProcedure
        .input(
            z.object({
                playlistId: z.string({ message: "Playlist ID is required" }),
                channelId: z.string().optional(),
            }),
        )
        .mutation(async ({ ctx }) => {
            const { playlist } = ctx;
            // implicitly checked by middleware
            await prisma.playlists.delete({
                where: { id: playlist.id },
            });

            return { success: true };
        }),

    getPlaylistById: playlistOwnerProcedure
        .input(
            z.object({
                playlistId: z.string({ message: "Playlist ID is required" }),
                channelId: z.string().optional(),
            }),
        )
        .query(async ({ ctx }) => {
            return { success: true, playlist: ctx.playlist };
        }),

    getPublicPlaylist: protectedProcedure
        .input(
            z.object({
                playlistId: z.string({ message: "Playlist ID is required" }),
            }),
        )
        .query(async ({ ctx, input }) => {
            const { playlistId } = input;
            const userId = ctx.user.id;

            const playlist = await prisma.playlists.findUnique({
                where: { id: playlistId },
                include: {
                    user: {
                        select: {
                            name: true,
                            image: true,
                        },
                    },
                    channels: {
                        select: {
                            name: true,
                            image: true,
                            handle: true,
                        },
                    },
                    _count: {
                        select: {
                            playlist_videos: true,
                        },
                    },
                },
            });

            if (!playlist) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Playlist not found",
                });
            }

            // Access Rules:
            // 1. Owner can always view
            // 2. Public/Unlisted can be viewed by anyone
            const isOwner = playlist.userId === userId;
            const isPublicOrUnlisted =
                playlist.visibility === "PUBLIC" ||
                playlist.visibility === "UNLISTED";

            if (!isOwner && !isPublicOrUnlisted) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "This playlist is private",
                });
            }

            // For public view, we might want to return a slightly different shape
            // or just the playlist as is.
            return { success: true, playlist };
        }),

    addVideoToPlaylist: playlistOwnerProcedure
        .input(
            z.object({
                playlistId: z.string({ message: "Playlist ID is required" }),
                channelId: z.string().optional(),
                videoId: z.string({ message: "Video ID is required" }),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { playlistId, videoId } = input;

            // Use transaction to ensure safe position calculation
            await prisma.$transaction(async (tx) => {
                // Check if video is already in playlist
                const existingItem = await tx.playlist_videos.findUnique({
                    where: { playlistId_videoId: { playlistId, videoId } },
                });

                if (existingItem) {
                    throw new TRPCError({
                        code: "CONFLICT",
                        message: "Video already in playlist",
                    });
                }

                // Get current max position
                const lastItem = await tx.playlist_videos.findFirst({
                    where: { playlistId },
                    orderBy: { position: "desc" },
                    select: { position: true },
                });

                const newPosition = (lastItem?.position ?? -1) + 1;

                await tx.playlist_videos.create({
                    data: {
                        playlistId,
                        videoId,
                        position: newPosition,
                    },
                });

                // Update count
                await tx.playlists.update({
                    where: { id: playlistId },
                    data: { videoCount: { increment: 1 } },
                });
            });

            return { success: true };
        }),

    removeVideoFromPlaylist: playlistOwnerProcedure
        .input(
            z.object({
                playlistId: z.string({ message: "Playlist ID is required" }),
                channelId: z.string().optional(),
                videoId: z.string({ message: "Video ID is required" }),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { playlistId, videoId } = input;

            await prisma.$transaction(async (tx) => {
                const item = await tx.playlist_videos.findUnique({
                    where: { playlistId_videoId: { playlistId, videoId } },
                    select: { position: true },
                });

                if (!item) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Video not in playlist",
                    });
                }

                await tx.playlist_videos.delete({
                    where: { playlistId_videoId: { playlistId, videoId } },
                });

                // Shift subsequent items up
                await tx.playlist_videos.updateMany({
                    where: {
                        playlistId,
                        position: { gt: item.position },
                    },
                    data: { position: { decrement: 1 } },
                });

                await tx.playlists.update({
                    where: { id: playlistId },
                    data: { videoCount: { decrement: 1 } },
                });
            });

            return { success: true };
        }),

    getPlaylistVideos: protectedProcedure
        .input(
            z.object({
                playlistId: z.string({ message: "Playlist ID is required" }),
                channelId: z
                    .string({ message: "Channel ID is required" })
                    .optional(),
                limit: z.number().min(1).max(100).default(50),
                cursor: z.number().nullish(), // Cursor is the 'position' of the last item
            }),
        )
        .query(async ({ ctx, input }) => {
            const { playlistId, limit, cursor } = input;

            const playlist = await prisma.playlists.findUnique({
                where: { id: playlistId },
                select: { id: true, visibility: true, userId: true },
            });

            if (!playlist) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Playlist not found",
                });
            }

            // Public/visibility check (if not owner)
            if (
                playlist.userId !== ctx.user.id &&
                playlist.visibility === "PRIVATE"
            ) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "Private playlist",
                });
            }

            const items = await prisma.playlist_videos.findMany({
                where: {
                    playlistId,
                    ...(cursor !== null && cursor !== undefined
                        ? { position: { gt: cursor } }
                        : {}),
                },
                take: limit + 1, // Get 1 extra to know if there's a next page
                include: {
                    videos: {
                        select: {
                            id: true,
                            title: true,
                            thumbnailUrl: true,
                            visibility: true,
                            viewCount: true,
                            likeCount: true,
                            dislikeCount: true,
                            duration: true,
                            isShort: true,
                            channels: {
                                select: {
                                    id: true,
                                    name: true,
                                    handle: true,
                                    image: true,
                                },
                            },
                        },
                    },
                },
                orderBy: { position: "asc" },
            });

            let nextCursor: typeof cursor | undefined = undefined;
            if (items.length > limit) {
                const nextItem = items.pop();
                nextCursor = nextItem?.position;
            }

            const videos = items.map((item) => {
                const { channels, ...restVideo } = item.videos;

                return {
                    ...restVideo,
                    channelId: channels?.id || "",
                    channels: {
                        id: channels?.id || "",
                        name: channels?.name || null,
                        handle: channels?.handle || null,
                        image: channels?.image || null,
                    },
                    position: item.position,
                    addedAt: item.addedAt,
                };
            });

            return { success: true, videos, nextCursor };
        }),

    reorderPlaylistVideos: playlistOwnerProcedure
        .input(
            z.object({
                playlistId: z.string(),
                channelId: z.string().optional(),
                videoId: z.string(),
                newPosition: z.number().min(0),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { playlistId, videoId, newPosition } = input;

            await prisma.$transaction(async (tx) => {
                const currentItem = await tx.playlist_videos.findUnique({
                    where: { playlistId_videoId: { playlistId, videoId } },
                    select: { position: true },
                });

                if (!currentItem) {
                    throw new TRPCError({
                        code: "NOT_FOUND",
                        message: "Video not in playlist",
                    });
                }

                const oldPosition = currentItem.position;

                if (oldPosition === newPosition) return;

                if (newPosition > oldPosition) {
                    // Moving Down: Shift items in (old, new] DOWN by 1
                    // e.g. 1->5. Items 2,3,4,5 become 1,2,3,4.
                    await tx.playlist_videos.updateMany({
                        where: {
                            playlistId,
                            position: { gt: oldPosition, lte: newPosition },
                        },
                        data: { position: { decrement: 1 } },
                    });
                } else {
                    // Moving Up: Shift items in [new, old) UP by 1
                    // e.g. 5->1. Items 1,2,3,4 become 2,3,4,5.
                    await tx.playlist_videos.updateMany({
                        where: {
                            playlistId,
                            position: { gte: newPosition, lt: oldPosition },
                        },
                        data: { position: { increment: 1 } },
                    });
                }

                // Move target
                await tx.playlist_videos.update({
                    where: { playlistId_videoId: { playlistId, videoId } },
                    data: { position: newPosition },
                });
            });

            return { success: true };
        }),

    /**
     * List all playlists for a channel (Studio Content page).
     */
    getChannelPlaylists: channelOwnerProcedure
        .input(
            z.object({
                channelId: z.string(),
                videoId: z.string().optional(),
            }),
        )
        .query(async ({ ctx, input }) => {
            const { channelId, videoId } = input;

            if (videoId) {
                // Fetch two pieces of data per playlist:
                //   1. Does it contain the given videoId? (containsVideo)
                //   2. What is its cover thumbnail? (first video by position)
                // Prisma doesn't support two filtered includes on the same relation,
                // so we fetch position-ordered items and derive containment in JS.
                const playlists = await prisma.playlists.findMany({
                    where: {
                        channelId,
                        deletedAt: null,
                    },
                    orderBy: { updatedAt: "desc" },
                    include: {
                        _count: {
                            select: { playlist_videos: true },
                        },
                        playlist_videos: {
                            orderBy: { position: "asc" },
                            take: 50, // enough to check containment + get first thumb
                            select: {
                                videoId: true,
                                position: true,
                                videos: { select: { thumbnailUrl: true } },
                            },
                        },
                    },
                });

                return {
                    success: true,
                    playlists: playlists.map((p) => {
                        const { playlist_videos, ...rest } = p;
                        return {
                            ...rest,
                            containsVideo: playlist_videos.some(
                                (pv) => pv.videoId === videoId,
                            ),
                            firstVideoThumbnail:
                                playlist_videos[0]?.videos?.thumbnailUrl ??
                                null,
                        };
                    }),
                };
            }

            const playlists = await prisma.playlists.findMany({
                where: {
                    channelId,
                    deletedAt: null,
                },
                orderBy: { updatedAt: "desc" },
                include: {
                    _count: {
                        select: { playlist_videos: true },
                    },
                    playlist_videos: {
                        take: 1,
                        orderBy: { position: "asc" },
                        select: {
                            videos: {
                                select: { thumbnailUrl: true },
                            },
                        },
                    },
                },
            });

            return {
                success: true,
                playlists: playlists.map((p) => {
                    const { playlist_videos, ...rest } = p;
                    return {
                        ...rest,
                        containsVideo: false,
                        firstVideoThumbnail:
                            playlist_videos[0]?.videos.thumbnailUrl ?? null,
                    };
                }),
            };
        }),

    getPlaylistFlow: publicProcedure
        .input(z.object({ playlistId: z.string() }))
        .query(async ({ ctx, input }) => {
            const playlist = await prisma.playlists.findUnique({
                where: { id: input.playlistId },
                include: {
                    user: { select: { name: true, image: true } },
                    channels: { select: { name: true, handle: true } },
                    playlist_videos: {
                        orderBy: { position: "asc" },
                        include: {
                            videos: {
                                select: {
                                    id: true,
                                    title: true,
                                    duration: true,
                                    thumbnailUrl: true,
                                    channels: {
                                        select: { name: true, handle: true },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            if (!playlist || playlist.deletedAt) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Playlist not found",
                });
            }

            // Privacy enforcement
            if (
                playlist.visibility === "PRIVATE" &&
                playlist.userId !== ctx.user?.id
            ) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "You do not have access to this playlist",
                });
            }

            return {
                id: playlist.id,
                title: playlist.title,
                authorName: playlist.channels?.name || playlist.user.name,
                authorHandle: playlist.channels?.handle || null,
                videos: playlist.playlist_videos
                    .filter(
                        (pv) => pv.videos && pv.videos.id, // safety check against corrupted FKs
                    )
                    .map((pv) => ({
                        id: pv.videos.id,
                        title: pv.videos.title,
                        duration: pv.videos.duration,
                        thumbnailUrl: pv.videos.thumbnailUrl,
                        channelName: pv.videos.channels.name,
                        channelHandle: pv.videos.channels.handle,
                        position: pv.position,
                    })),
            };
        }),
});
