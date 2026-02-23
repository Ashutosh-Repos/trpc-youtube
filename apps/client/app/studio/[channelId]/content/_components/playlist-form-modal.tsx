"use client";

import { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

import { RouterOutputs } from "@/lib/trpc-shared";

interface PlaylistFormModalProps {
    channelId: string;
    playlist?: RouterOutputs["playlist"]["getChannelPlaylists"]["playlists"][number];
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export const PlaylistFormModal = ({
    channelId,
    playlist,
    isOpen,
    onClose,
    onSuccess,
}: PlaylistFormModalProps) => {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [visibility, setVisibility] = useState<
        "PUBLIC" | "PRIVATE" | "UNLISTED" | "SCHEDULED"
    >("PUBLIC");

    const createPlaylistMutation = trpc.playlist.createPlaylist.useMutation({
        onSuccess: () => {
            toast.success("Playlist created successfully");
            onSuccess?.();
            onClose();
        },
        onError: (error) => {
            toast.error(error.message || "Failed to create playlist");
        },
    });

    const updatePlaylistMutation = trpc.playlist.updatePlaylist.useMutation({
        onSuccess: () => {
            toast.success("Playlist updated successfully");
            onSuccess?.();
            onClose();
        },
        onError: (error) => {
            toast.error(error.message || "Failed to update playlist");
        },
    });

    const isPending =
        createPlaylistMutation.isPending || updatePlaylistMutation.isPending;

    useEffect(() => {
        if (playlist) {
            setTitle(playlist.title || "");
            setDescription(playlist.description || "");
            setVisibility(playlist.visibility || "PUBLIC");
        } else {
            setTitle("");
            setDescription("");
            setVisibility("PUBLIC");
        }
    }, [playlist, isOpen]);

    const handleSubmit = () => {
        if (!title.trim()) {
            toast.error("Title is required");
            return;
        }

        if (playlist) {
            updatePlaylistMutation.mutate({
                playlistId: playlist.id,
                title,
                description,
                visibility,
            });
        } else {
            createPlaylistMutation.mutate({
                title,
                description,
                channelId,
            });
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-surface-1 border-border/10 text-foreground max-w-md rounded-2xl shadow-2xl">
                <DialogHeader className="pt-8 px-8">
                    <DialogTitle className="text-2xl font-black tracking-tighter uppercase text-foreground/90">
                        {playlist ? "Edit Playlist" : "New Playlist"}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label
                            htmlFor="title"
                            className="text-[11px] font-black uppercase tracking-widest text-foreground/40"
                        >
                            Title (required)
                        </Label>
                        <Input
                            id="title"
                            placeholder="Give your playlist a title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="bg-surface-2 border-border/10 focus-visible:ring-primary/20 focus-visible:border-primary/30 h-12 rounded-xl transition-all font-medium"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label
                            htmlFor="description"
                            className="text-[11px] font-black uppercase tracking-widest text-foreground/40"
                        >
                            Description
                        </Label>
                        <Textarea
                            id="description"
                            placeholder="Tell viewers what your playlist is about"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="bg-surface-2 border-border/10 focus-visible:ring-primary/20 focus-visible:border-primary/30 min-h-[120px] resize-none rounded-xl transition-all font-medium p-4"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-foreground/40">
                            Visibility
                        </Label>
                        <Select
                            value={visibility}
                            onValueChange={(v) =>
                                setVisibility(
                                    v as "PUBLIC" | "PRIVATE" | "UNLISTED",
                                )
                            }
                        >
                            <SelectTrigger className="bg-surface-2 border-border/10 focus:ring-primary/20 focus:border-primary/30 h-12 rounded-xl transition-all">
                                <SelectValue placeholder="Select visibility" />
                            </SelectTrigger>
                            <SelectContent className="bg-surface-3 border-border/10 text-foreground rounded-xl shadow-2xl p-1.5">
                                <SelectItem
                                    value="PUBLIC"
                                    className="rounded-lg focus:bg-primary/10 focus:text-primary transition-colors cursor-pointer"
                                >
                                    Public
                                </SelectItem>
                                <SelectItem
                                    value="UNLISTED"
                                    className="rounded-lg focus:bg-primary/10 focus:text-primary transition-colors cursor-pointer"
                                >
                                    Unlisted
                                </SelectItem>
                                <SelectItem
                                    value="PRIVATE"
                                    className="rounded-lg focus:bg-primary/10 focus:text-primary transition-colors cursor-pointer"
                                >
                                    Private
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-[10px] text-muted-foreground/30 mt-1.5 pl-1 font-black uppercase tracking-widest">
                            {visibility === "PUBLIC" &&
                                "Public • Anyone can search for and view"}
                            {visibility === "UNLISTED" &&
                                "Unlisted • Anyone with the link can view"}
                            {visibility === "PRIVATE" &&
                                "Private • Only you can view"}
                        </p>
                    </div>
                </div>

                <DialogFooter className="gap-3 sm:gap-0 px-8 pb-8 pt-4">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="hover:bg-surface-2 font-black uppercase text-[11px] tracking-widest rounded-xl transition-all"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isPending}
                        className="bg-primary hover:bg-primary/90 text-black font-black uppercase text-[11px] tracking-widest rounded-xl px-10 transition-all shadow-[0_0_20px_-5px_oklch(var(--primary)/0.4)]"
                    >
                        {isPending
                            ? "Saving..."
                            : playlist
                              ? "Save Changes"
                              : "Create Playlist"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
