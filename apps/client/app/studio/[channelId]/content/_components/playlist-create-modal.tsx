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
            <DialogContent className="bg-[#1f1f23] border-white/10 text-white max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold tracking-tight">
                        New Playlist
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label
                            htmlFor="title"
                            className="text-zinc-400 font-semibold uppercase text-[10px] tracking-widest"
                        >
                            Title (required)
                        </Label>
                        <Input
                            id="title"
                            placeholder="Add title"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="bg-black/20 border-white/5 focus-visible:ring-primary h-12"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label
                            htmlFor="description"
                            className="text-zinc-400 font-semibold uppercase text-[10px] tracking-widest"
                        >
                            Description
                        </Label>
                        <Textarea
                            id="description"
                            placeholder="Add description"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="bg-black/20 border-white/5 focus-visible:ring-primary min-h-[100px] resize-none"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-zinc-400 font-semibold uppercase text-[10px] tracking-widest">
                            Visibility
                        </Label>
                        <Select
                            value={visibility}
                            onValueChange={(v: any) => setVisibility(v)}
                        >
                            <SelectTrigger className="bg-black/20 border-white/5 h-12">
                                <SelectValue placeholder="Select visibility" />
                            </SelectTrigger>
                            <SelectContent className="bg-[#1f1f23] border-white/10 text-white">
                                <SelectItem value="PUBLIC">Public</SelectItem>
                                <SelectItem value="UNLISTED">
                                    Unlisted
                                </SelectItem>
                                <SelectItem value="PRIVATE">Private</SelectItem>
                            </SelectContent>
                        </Select>
                        <p className="text-[10px] text-zinc-500 mt-1 pl-1">
                            {visibility === "PUBLIC" &&
                                "Anyone can search for and view"}
                            {visibility === "UNLISTED" &&
                                "Anyone with the link can view"}
                            {visibility === "PRIVATE" && "Only you can view"}
                        </p>
                    </div>
                </div>

                <DialogFooter className="gap-2 sm:gap-0">
                    <Button
                        variant="ghost"
                        onClick={onClose}
                        className="hover:bg-white/5 font-bold"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSubmit}
                        disabled={isPending}
                        className="bg-primary hover:bg-primary/90 text-black font-bold px-8"
                    >
                        {isPending ? "Creating..." : "Create"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
