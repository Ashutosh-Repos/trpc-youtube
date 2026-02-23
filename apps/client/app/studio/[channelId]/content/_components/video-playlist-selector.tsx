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
            <DialogContent className="bg-surface-3/95 backdrop-blur-2xl border-border/40 text-foreground max-w-sm p-0 overflow-hidden rounded-3xl shadow-2xl">
                <DialogHeader className="p-6 border-b border-border/10">
                    <DialogTitle className="text-xl font-black tracking-tighter uppercase">
                        Save video to...
                    </DialogTitle>
                </DialogHeader>

                <div className="p-4">
                    <div className="relative mb-4 group">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/30 group-focus-within:text-primary transition-colors" />
                        <Input
                            placeholder="Filter playlists"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="bg-surface-1 border-border/10 pl-10 h-10 text-[11px] font-black uppercase tracking-widest rounded-xl focus-visible:ring-primary/20 transition-all"
                        />
                    </div>

                    <ScrollArea className="h-[300px] pr-4">
                        {loading ? (
                            <div className="flex items-center justify-center h-full">
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/30 animate-pulse">
                                    Loading playlists...
                                </p>
                            </div>
                        ) : filteredPlaylists.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full gap-2 opacity-50">
                                <ListVideo className="w-10 h-10 text-muted-foreground/20" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/40">
                                    No playlists found
                                </p>
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
                                            className="border-border/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary rounded-md h-5 w-5"
                                        />
                                        <div className="flex flex-col min-w-0">
                                            <Label
                                                htmlFor={playlist.id}
                                                className="text-[13px] font-black tracking-tight truncate cursor-pointer group-hover:text-primary transition-colors uppercase"
                                            >
                                                {playlist.title}
                                            </Label>
                                            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/40">
                                                {playlist.visibility.toLowerCase()}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>
                </div>

                <div className="p-3 border-t border-border/10 bg-surface-1/50">
                    <Button
                        variant="ghost"
                        className="w-full justify-start gap-4 h-12 hover:bg-primary/10 hover:text-primary rounded-xl font-black text-[11px] uppercase tracking-widest transition-all"
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
