"use client";

import { useState } from "react";
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

interface PlaylistCreateModalProps {
    channelId: string;
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export const PlaylistCreateModal = ({
    channelId,
    isOpen,
    onClose,
    onSuccess,
}: PlaylistCreateModalProps) => {
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [visibility, setVisibility] = useState<
        "PUBLIC" | "PRIVATE" | "UNLISTED"
    >("PUBLIC");

    const createPlaylistMutation = trpc.playlist.createPlaylist.useMutation({
        onSuccess: () => {
            toast.success("Playlist created successfully");
            setTitle("");
            setDescription("");
            setVisibility("PUBLIC");
            onSuccess?.();
            onClose();
        },
        onError: (error) => {
            toast.error(error.message || "Failed to create playlist");
        },
    });

    const isPending = createPlaylistMutation.isPending;

    const handleSubmit = () => {
        if (!title.trim()) {
            toast.error("Title is required");
            return;
        }

        createPlaylistMutation.mutate({
            title,
            description,
            channelId,
        });
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="bg-surface-1 border-border/10 text-foreground max-w-md rounded-3xl shadow-2xl p-0 overflow-hidden">
                <DialogHeader className="p-8 border-b border-border/10">
                    <DialogTitle className="text-2xl font-black tracking-tighter uppercase text-foreground/90">
                        Create New Playlist
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label
                            htmlFor="title"
                            className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/40 ml-1"
                        >
                            Playlist Title (required)
                        </Label>
                        <Input
                            id="title"
                            placeholder="Enter playlist title..."
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="bg-surface-2 border-border/10 focus-visible:ring-primary/20 focus-visible:border-primary/30 h-14 rounded-2xl transition-all font-bold text-lg px-6"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label
                            htmlFor="description"
                            className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/40 ml-1"
                        >
                            Description
                        </Label>
                        <Textarea
                            id="description"
                            placeholder="Tell viewers what your playlist is about..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="bg-surface-2 border-border/10 focus-visible:ring-primary/20 focus-visible:border-primary/30 min-h-[120px] resize-none rounded-2xl transition-all font-medium p-4"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/40 ml-1">
                            Visibility
                        </Label>
                        <Select
                            value={visibility}
                            onValueChange={(
                                v: "PUBLIC" | "PRIVATE" | "UNLISTED",
                            ) => setVisibility(v)}
                        >
                            <SelectTrigger className="bg-surface-2 border-border/10 focus:ring-primary/20 focus:border-primary/30 h-14 rounded-2xl transition-all px-6 font-bold">
                                <SelectValue placeholder="Select visibility" />
                            </SelectTrigger>
                            <SelectContent className="bg-surface-3 border-border/10 text-foreground rounded-2xl shadow-2xl p-1.5">
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
                        <p className="text-[10px] text-muted-foreground/30 mt-2 pl-1 font-black uppercase tracking-widest">
                            {visibility === "PUBLIC" &&
                                "Public • Anyone can search for and view"}
                            {visibility === "UNLISTED" &&
                                "Unlisted • Anyone with the link can view"}
                            {visibility === "PRIVATE" &&
                                "Private • Only you can view"}
                        </p>
                    </div>
                </div>

                <DialogFooter className="p-8 bg-surface-2/10 border-t border-border/10 gap-4">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="hover:bg-surface-2 font-black uppercase text-[11px] tracking-widest rounded-xl transition-all h-12 px-8"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isPending}
                        className="bg-primary hover:bg-primary/90 text-black font-black uppercase text-[11px] tracking-widest rounded-xl h-12 px-10 transition-all shadow-lg shadow-primary/20"
                    >
                        {isPending ? "Creating..." : "Create Playlist"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
