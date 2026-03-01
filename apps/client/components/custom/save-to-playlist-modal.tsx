"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ListPlus, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";

export function SaveToPlaylistModal({ videoId }: { videoId: string }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newTitle, setNewTitle] = useState("");

    const utils = trpc.useUtils();

    const { data, isLoading } = trpc.playlist.getUserPlaylists.useQuery(
        { videoId },
        { enabled: isOpen },
    );

    const addToPlaylist = trpc.playlist.addVideoToPlaylist.useMutation({
        onMutate: async ({ playlistId }) => {
            await utils.playlist.getUserPlaylists.cancel({ videoId });
            const previousData = utils.playlist.getUserPlaylists.getData({
                videoId,
            });

            if (previousData) {
                utils.playlist.getUserPlaylists.setData(
                    { videoId },
                    {
                        ...previousData,
                        playlists: previousData.playlists.map((p) =>
                            p.id === playlistId
                                ? { ...p, containsVideo: true }
                                : p,
                        ),
                    },
                );
            }
            return { previousData };
        },
        onError: (err, newTodo, context) => {
            toast.error(err.message);
            if (context?.previousData) {
                utils.playlist.getUserPlaylists.setData(
                    { videoId },
                    context.previousData,
                );
            }
        },
        onSettled: () => {
            utils.playlist.getUserPlaylists.invalidate({ videoId });
        },
    });

    const removeFromPlaylist =
        trpc.playlist.removeVideoFromPlaylist.useMutation({
            onMutate: async ({ playlistId }) => {
                await utils.playlist.getUserPlaylists.cancel({ videoId });
                const previousData = utils.playlist.getUserPlaylists.getData({
                    videoId,
                });

                if (previousData) {
                    utils.playlist.getUserPlaylists.setData(
                        { videoId },
                        {
                            ...previousData,
                            playlists: previousData.playlists.map((p) =>
                                p.id === playlistId
                                    ? { ...p, containsVideo: false }
                                    : p,
                            ),
                        },
                    );
                }
                return { previousData };
            },
            onError: (err, newTodo, context) => {
                toast.error(err.message);
                if (context?.previousData) {
                    utils.playlist.getUserPlaylists.setData(
                        { videoId },
                        context.previousData,
                    );
                }
            },
            onSettled: () => {
                utils.playlist.getUserPlaylists.invalidate({ videoId });
            },
        });

    const createPlaylist = trpc.playlist.createPlaylist.useMutation({
        onSuccess: (res) => {
            utils.playlist.getUserPlaylists.invalidate({ videoId });
            setIsCreating(false);
            setNewTitle("");
            // Auto add to the new playlist
            addToPlaylist.mutate({
                playlistId: res.playlist.id,
                videoId,
            });
        },
        onError: (err) => toast.error(err.message),
    });

    const handleToggle = (playlistId: string, currentStatus: boolean) => {
        if (currentStatus) {
            removeFromPlaylist.mutate({ playlistId, videoId });
        } else {
            addToPlaylist.mutate({ playlistId, videoId });
        }
    };

    const handleCreate = () => {
        if (!newTitle.trim()) return;
        createPlaylist.mutate({ title: newTitle.trim() });
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="secondary"
                    className="rounded-2xl px-6 h-10 bg-surface-1/60 backdrop-blur-xl border border-border/40 hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-all shadow-sm"
                >
                    <ListPlus className="h-4 w-4 mr-2" />
                    Save
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px] bg-surface-1 border-border/20 rounded-3xl">
                <DialogHeader className="px-2">
                    <DialogTitle className="text-xl font-black">
                        Save to playlist
                    </DialogTitle>
                    <DialogDescription className="text-xs">
                        Select playlists to add this video to.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col gap-3 py-4 max-h-[300px] overflow-y-auto px-2">
                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : data?.playlists.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            You don&apos;t have any playlists yet.
                        </p>
                    ) : (
                        data?.playlists.map((playlist) => (
                            <div
                                key={playlist.id}
                                className="flex items-center space-x-3 p-2 rounded-xl hover:bg-surface-2/50 transition-colors"
                            >
                                <Checkbox
                                    id={`playlist-${playlist.id}`}
                                    checked={playlist.containsVideo}
                                    onCheckedChange={() =>
                                        handleToggle(
                                            playlist.id,
                                            playlist.containsVideo,
                                        )
                                    }
                                    disabled={
                                        addToPlaylist.isPending ||
                                        removeFromPlaylist.isPending
                                    }
                                />
                                <label
                                    htmlFor={`playlist-${playlist.id}`}
                                    className="text-sm font-medium leading-none cursor-pointer flex-1 truncate select-none"
                                >
                                    {playlist.title}
                                </label>
                            </div>
                        ))
                    )}
                </div>

                <div className="pt-4 px-2 border-t border-border/10">
                    {isCreating ? (
                        <div className="flex flex-col gap-3">
                            <Input
                                placeholder="Playlist title..."
                                value={newTitle}
                                onChange={(e) => setNewTitle(e.target.value)}
                                className="bg-surface-2/50 border-border/20"
                                autoFocus
                            />
                            <div className="flex justify-end gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setIsCreating(false)}
                                    className="text-xs"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    size="sm"
                                    onClick={handleCreate}
                                    disabled={
                                        !newTitle.trim() ||
                                        createPlaylist.isPending
                                    }
                                    className="text-xs font-bold"
                                >
                                    {createPlaylist.isPending && (
                                        <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                                    )}
                                    Create
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <Button
                            variant="ghost"
                            className="w-full justify-start text-primary hover:text-primary hover:bg-primary/10"
                            onClick={() => setIsCreating(true)}
                        >
                            <Plus className="w-4 h-4 mr-2" />
                            Create new playlist
                        </Button>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
