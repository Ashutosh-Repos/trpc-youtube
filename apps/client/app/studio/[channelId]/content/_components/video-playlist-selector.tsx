"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ListVideo, Search, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface VideoPlaylistSelectorProps {
    channelId: string;
    videoIds: string[]; // Supports bulk add/remove
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export const VideoPlaylistSelector = ({
    channelId,
    videoIds,
    isOpen,
    onClose,
    onSuccess,
}: VideoPlaylistSelectorProps) => {
    const utils = trpc.useUtils();
    const [search, setSearch] = useState("");

    const playlistsQuery = trpc.playlist.getChannelPlaylists.useQuery(
        {
            channelId,
            videoId: videoIds.length === 1 ? videoIds[0] : undefined,
        },
        { enabled: isOpen },
    );

    const addToPlaylistMutation = trpc.playlist.addVideoToPlaylist.useMutation({
        onSuccess: (_, variables) => {
            playlistsQuery.refetch();
            utils.playlist.getChannelPlaylists.invalidate();
            utils.playlist.getPlaylistVideos.invalidate({
                playlistId: variables.playlistId,
            });
            utils.playlist.getPlaylistById.invalidate({
                playlistId: variables.playlistId,
            });
            toast.success("Added to playlist");
        },
        onError: (error) => {
            toast.error(error.message || "Failed to add to playlist");
        },
    });

    const removeFromPlaylistMutation =
        trpc.playlist.removeVideoFromPlaylist.useMutation({
            onSuccess: (_, variables) => {
                playlistsQuery.refetch();
                utils.playlist.getChannelPlaylists.invalidate();
                utils.playlist.getPlaylistVideos.invalidate({
                    playlistId: variables.playlistId,
                });
                utils.playlist.getPlaylistById.invalidate({
                    playlistId: variables.playlistId,
                });
                toast.success("Removed from playlist");
            },
            onError: (error) => {
                toast.error(error.message || "Failed to remove from playlist");
            },
        });

    const playlists = playlistsQuery.data?.playlists ?? [];
    const loading = playlistsQuery.isLoading;

    const handleTogglePlaylist = async (
        playlistId: string,
        isChecked: boolean,
    ) => {
        // Optimistic update could be added here, but refetch is safer for now
        const promises = videoIds.map((videoId) =>
            isChecked
                ? addToPlaylistMutation.mutateAsync({ playlistId, videoId })
                : removeFromPlaylistMutation.mutateAsync({
                      playlistId,
                      videoId,
                  }),
        );

        const results = await Promise.allSettled(promises);
        const failed = results.filter((r) => r.status === "rejected");

        if (failed.length > 0) {
            // Error toast is handled by mutation onError, but for bulk we might want summary
            // if single video, mutation onError handles it.
        }
    };

    const filteredPlaylists = playlists.filter((p) =>
        p.title.toLowerCase().includes(search.toLowerCase()),
    );

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-[#1f1f23] border-white/10 text-white max-w-sm p-0 overflow-hidden">
                <DialogHeader className="p-4 border-b border-white/5">
                    <DialogTitle className="text-lg font-bold">
                        Save video to...
                    </DialogTitle>
                </DialogHeader>

                <div className="p-2">
                    <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                        <Input
                            placeholder="Filter playlists"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="bg-black/20 border-half border-white/5 pl-9 h-10 focus-visible:ring-primary"
                        />
                    </div>

                    <ScrollArea className="h-[300px] pr-4">
                        {loading ? (
                            <div className="flex items-center justify-center h-full">
                                <p className="text-xs text-zinc-500 animate-pulse">
                                    Loading playlists...
                                </p>
                            </div>
                        ) : filteredPlaylists.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 opacity-50">
                                <ListVideo className="w-8 h-8" />
                                <p className="text-xs">No playlists found</p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {filteredPlaylists.map((playlist) => (
                                    <div
                                        key={playlist.id}
                                        className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-white/5 transition-colors cursor-pointer group"
                                        onClick={(e) => {
                                            // Prevent toggling if clicking directly on checkbox (handled by its own handler)
                                            // But standard pattern is row click toggles too
                                            // For now, let's keep it simple and just let checkbox handle it
                                            // or implement row click
                                        }}
                                    >
                                        <Checkbox
                                            id={playlist.id}
                                            checked={playlist.containsVideo}
                                            onCheckedChange={(checked) =>
                                                handleTogglePlaylist(
                                                    playlist.id,
                                                    !!checked,
                                                )
                                            }
                                            className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                        />
                                        <div className="flex flex-col min-w-0">
                                            <Label
                                                htmlFor={playlist.id}
                                                className="text-sm font-semibold truncate cursor-pointer group-hover:text-primary transition-colors"
                                            >
                                                {playlist.title}
                                            </Label>
                                            <span className="text-[10px] text-zinc-500 capitalize">
                                                {playlist.visibility.toLowerCase()}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </div>

                <div className="p-2 border-t border-white/5 bg-black/20">
                    <Button
                        variant="ghost"
                        className="w-full justify-start gap-3 h-12 hover:bg-white/5 font-bold text-sm"
                        onClick={() => {
                            toast.info(
                                "Feature coming soon: New playlist from here",
                            );
                        }}
                    >
                        <Plus className="w-5 h-5" />
                        Create new playlist
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
};
