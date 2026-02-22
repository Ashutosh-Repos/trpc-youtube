"use server";

import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import {
    ActionResponse,
    createPlaylistSchema,
    CreatePlaylistInput,
    updatePlaylistSchema,
    UpdatePlaylistInput,
    createErrorResponse,
} from "./schema-types";
import { getSessionUser } from "./user";

/**
 * Fetch playlists for a channel
 */
export async function getChannelPlaylists(
    channelId: string,
): Promise<ActionResponse<any[]>> {
    try {
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
            },
        });

        return { success: true, data: JSON.parse(JSON.stringify(playlists)) };
    } catch (error) {
        console.error(`[Playlist] getChannelPlaylists failed:`, error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to fetch playlists",
        );
    }
}

/**
 * Create a new playlist
 */
export async function createPlaylist(
    input: CreatePlaylistInput,
): Promise<ActionResponse<any>> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return createErrorResponse("UNAUTHORIZED", "Login required", 401);
        }

        const data = createPlaylistSchema.parse(input);

        // If channelId is provided, verify ownership
        if (data.channelId) {
            const channel = await prisma.channels.findUnique({
                where: { id: data.channelId },
                select: { userId: true },
            });
            if (!channel || channel.userId !== user.id) {
                return createErrorResponse("FORBIDDEN", "Access denied", 403);
            }
        }

        const playlist = await prisma.playlists.create({
            data: {
                title: data.title,
                description: data.description,
                visibility: data.visibility,
                userId: user.id,
                channelId: data.channelId,
            },
        });

        if (data.channelId) {
            revalidatePath(`/studio/${data.channelId}/content`);
        }

        return { success: true, data: JSON.parse(JSON.stringify(playlist)) };
    } catch (error) {
        console.error(`[Playlist] createPlaylist failed:`, error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to create playlist",
        );
    }
}

/**
 * Update an existing playlist
 */
export async function updatePlaylist(
    playlistId: string,
    input: UpdatePlaylistInput,
): Promise<ActionResponse<any>> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return createErrorResponse("UNAUTHORIZED", "Login required", 401);
        }

        const data = updatePlaylistSchema.parse(input);

        const playlist = await prisma.playlists.findUnique({
            where: { id: playlistId },
            select: { userId: true, channelId: true },
        });

        if (!playlist || playlist.userId !== user.id) {
            return createErrorResponse("FORBIDDEN", "Access denied", 403);
        }

        const updated = await prisma.playlists.update({
            where: { id: playlistId },
            data,
        });

        if (playlist.channelId) {
            revalidatePath(`/studio/${playlist.channelId}/content`);
        }

        return { success: true, data: JSON.parse(JSON.stringify(updated)) };
    } catch (error) {
        console.error(`[Playlist] updatePlaylist failed:`, error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to update playlist",
        );
    }
}

/**
 * Soft delete a playlist
 */
export async function deletePlaylist(
    playlistId: string,
): Promise<ActionResponse<{ id: string }>> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return createErrorResponse("UNAUTHORIZED", "Login required", 401);
        }

        const playlist = await prisma.playlists.findUnique({
            where: { id: playlistId },
            select: { userId: true, channelId: true },
        });

        if (!playlist || playlist.userId !== user.id) {
            return createErrorResponse("FORBIDDEN", "Access denied", 403);
        }

        await prisma.playlists.update({
            where: { id: playlistId },
            data: { deletedAt: new Date() },
        });

        if (playlist.channelId) {
            revalidatePath(`/studio/${playlist.channelId}/content`);
        }

        return { success: true, data: { id: playlistId } };
    } catch (error) {
        console.error(`[Playlist] deletePlaylist failed:`, error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to delete playlist",
        );
    }
}

/**
 * Add a video to a playlist
 */
export async function addVideoToPlaylist(
    playlistId: string,
    videoId: string,
): Promise<ActionResponse<any>> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return createErrorResponse("UNAUTHORIZED", "Login required", 401);
        }

        // Verify playlist ownership
        const playlist = await prisma.playlists.findUnique({
            where: { id: playlistId },
            select: { userId: true, _count: { select: { playlist_videos: true } } },
        });

        if (!playlist || playlist.userId !== user.id) {
            return {
                success: false,
                error: { code: "FORBIDDEN", message: "Access denied" },
            };
        }

        // Check if video already in playlist
        const existing = await prisma.playlist_videos.findUnique({
            where: {
                playlistId_videoId: { playlistId, videoId },
            },
        });

        if (existing) {
            return {
                success: true,
                data: JSON.parse(JSON.stringify(existing)),
            };
        }

        const playlistVideo = await prisma.playlist_videos.create({
            data: {
                playlistId,
                videoId,
                position: playlist._count.playlist_videos, // End of playlist
            },
        });

        // Update video count on playlist
        await prisma.playlists.update({
            where: { id: playlistId },
            data: { videoCount: { increment: 1 } },
        });

        return {
            success: true,
            data: JSON.parse(JSON.stringify(playlistVideo)),
        };
    } catch (error) {
        console.error(`[Playlist] addVideoToPlaylist failed:`, error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to add video to playlist",
        );
    }
}

/**
 * Remove a video from a playlist
 */
export async function removeVideoFromPlaylist(
    playlistId: string,
    videoId: string,
): Promise<ActionResponse<{ success: boolean }>> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return createErrorResponse("UNAUTHORIZED", "Login required", 401);
        }

        // Verify playlist ownership
        const playlist = await prisma.playlists.findUnique({
            where: { id: playlistId },
            select: { userId: true },
        });

        if (!playlist || playlist.userId !== user.id) {
            return createErrorResponse("FORBIDDEN", "Access denied", 403);
        }

        await prisma.playlist_videos.delete({
            where: {
                playlistId_videoId: { playlistId, videoId },
            },
        });

        // Update video count
        await prisma.playlists.update({
            where: { id: playlistId },
            data: { videoCount: { decrement: 1 } },
        });

        return { success: true, data: { success: true } };
    } catch (error) {
        console.error(`[Playlist] removeVideoFromPlaylist failed:`, error);
        return createErrorResponse("INTERNAL_ERROR", "Failed to remove video");
    }
}

/**
 * Fetch videos within a playlist
 */
export async function getPlaylistVideos(
    playlistId: string,
): Promise<ActionResponse<any[]>> {
    try {
        const videos = await prisma.playlist_videos.findMany({
            where: { playlistId },
            include: {
                videos: {
                    select: {
                        id: true,
                        title: true,
                        thumbnailUrl: true,
                        visibility: true,
                        viewCount: true,
                    },
                },
            },
            orderBy: { position: "asc" },
        });

        // Flatten the structure for the UI
        const data = videos.map((v: any) => ({
            ...v.video,
            position: v.position,
        }));

        return { success: true, data: JSON.parse(JSON.stringify(data)) };
    } catch (error) {
        console.error(`[Playlist] getPlaylistVideos failed:`, error);
        return createErrorResponse("INTERNAL_ERROR", "Failed to fetch videos");
    }
}

/**
 * Reorder videos in a playlist
 */
export async function reorderPlaylistVideos(
    playlistId: string,
    videoIds: string[], // In the new order
): Promise<ActionResponse<{ success: boolean }>> {
    try {
        const user = await getSessionUser();
        if (!user) {
            return createErrorResponse("UNAUTHORIZED", "Login required", 401);
        }

        // Verify playlist ownership
        const playlist = await prisma.playlists.findUnique({
            where: { id: playlistId },
            select: { userId: true },
        });

        if (!playlist || playlist.userId !== user.id) {
            return createErrorResponse("FORBIDDEN", "Access denied", 403);
        }

        // Update positions in a transaction
        await prisma.$transaction(
            videoIds.map((id, index) =>
                prisma.playlist_videos.update({
                    where: {
                        playlistId_videoId: {
                            playlistId,
                            videoId: id,
                        },
                    },
                    data: { position: index },
                }),
            ),
        );

        return { success: true, data: { success: true } };
    } catch (error) {
        console.error(`[Playlist] reorderPlaylistVideos failed:`, error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to reorder videos",
        );
    }
}

/**
 * Fetch a single playlist by ID
 */
export async function getPlaylistById(
    playlistId: string,
): Promise<ActionResponse<any>> {
    try {
        const playlist = await prisma.playlists.findUnique({
            where: { id: playlistId },
            include: {
                channels: {
                    select: {
                        id: true,
                        name: true,
                        image: true,
                        handle: true,
                    },
                },
                _count: {
                    select: { playlist_videos: true },
                },
            },
        });

        if (!playlist) {
            return createErrorResponse("NOT_FOUND", "Playlist not found", 404);
        }

        // Check visibility if needed (e.g. private playlists only for owner)
        // For now assuming PUBLIC or user-owned logic in component or simple check here
        if (playlist.visibility === "PRIVATE") {
            const user = await getSessionUser();
            if (!user || user.id !== playlist.userId) {
                // return createErrorResponse("FORBIDDEN", "Access denied", 403);
            }
        }

        return { success: true, data: JSON.parse(JSON.stringify(playlist)) };
    } catch (error) {
        console.error(`[Playlist] getPlaylistById failed:`, error);
        return createErrorResponse(
            "INTERNAL_ERROR",
            "Failed to fetch playlist",
        );
    }
}
