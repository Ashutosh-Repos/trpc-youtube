"use client";

import {
    Pencil,
    Globe,
    Lock,
    EyeOff,
    MoreVertical,
    Share2,
    Trash,
    ListVideo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, getMediaUrl } from "@/lib/utils";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useRouter } from "next/navigation";
import { RouterOutputs } from "@/lib/trpc-shared";

interface PlaylistRowProps {
    playlist: RouterOutputs["playlist"]["getChannelPlaylists"]["playlists"][number];
    isSelected: boolean;
    onSelect: (checked: boolean) => void;
    onEdit?: (playlist: any) => void;
}

export const PlaylistRow = ({
    playlist,
    isSelected,
    onSelect,
    onEdit,
}: PlaylistRowProps) => {
    const router = useRouter();
    const utils = trpc.useUtils();

    const updatePlaylistMutation = trpc.playlist.updatePlaylist.useMutation({
        onSuccess: () => {
            toast.success("Visibility updated");
            utils.playlist.getChannelPlaylists.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || "Failed to update visibility");
        },
    });

    const deletePlaylistMutation = trpc.playlist.deletePlaylist.useMutation({
        onSuccess: () => {
            toast.success("Playlist deleted");
            utils.playlist.getChannelPlaylists.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || "Failed to delete playlist");
        },
    });

    const isPending =
        updatePlaylistMutation.isPending || deletePlaylistMutation.isPending;

    const handleVisibilityChange = (
        newVisibility: "PUBLIC" | "PRIVATE" | "UNLISTED",
    ) => {
        updatePlaylistMutation.mutate({
            playlistId: playlist.id,
            visibility: newVisibility,
        });
    };

    const handleDelete = () => {
        if (!window.confirm("Are you sure you want to delete this playlist?"))
            return;

        deletePlaylistMutation.mutate({
            playlistId: playlist.id,
        });
    };

    const handleCopyLink = () => {
        const url = `${window.location.origin}/playlist?list=${playlist.id}`;
        navigator.clipboard.writeText(url);
        toast.success("Link copied to clipboard");
    };

    return (
        <div
            className={cn(
                "grid grid-cols-12 gap-4 px-6 py-4 transition-colors group relative border-b border-white/5",
                isSelected
                    ? "bg-primary/5 hover:bg-primary/10"
                    : "hover:bg-white/5",
            )}
        >
            <div className="col-span-6 flex gap-4 min-w-0">
                <div className="relative w-32 aspect-video rounded-md overflow-hidden bg-zinc-900 shrink-0 border border-white/5 flex items-center justify-center group/thumb">
                    {playlist.thumbnailUrl || playlist.firstVideoThumbnail ? (
                        <img
                            src={getMediaUrl(
                                playlist.thumbnailUrl ||
                                    playlist.firstVideoThumbnail,
                            )}
                            alt={playlist.title}
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <div className="flex flex-col items-center gap-1 opacity-20">
                            <ListVideo className="w-8 h-8" />
                        </div>
                    )}
                    <div className="absolute inset-y-0 right-0 w-1/3 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-1 border-l border-white/5">
                        <span className="text-sm font-bold">
                            {playlist._count?.playlist_videos || 0}
                        </span>
                        <ListVideo className="w-3 h-3" />
                    </div>
                </div>

                <div className="flex flex-col justify-center min-w-0 pr-4">
                    <Link
                        href={`/studio/${playlist.channelId}/content/playlist/${playlist.id}`}
                        className="font-semibold text-sm truncate hover:text-primary transition-colors cursor-pointer tracking-tight"
                    >
                        {playlist.title}
                    </Link>
                    <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5 font-medium italic opacity-70">
                        {playlist.description || "No description provided"}
                    </p>

                    <div className="flex items-center gap-0.5 mt-2.5 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0 duration-300">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onEdit?.(playlist)}
                            className="h-8 w-8 rounded-full hover:bg-white/10 hover:text-primary"
                            title="Edit"
                        >
                            <Pencil className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </div>

            <div className="col-span-2 flex items-center">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            className="h-auto p-2 gap-2 hover:bg-white/5 group/trigger"
                        >
                            <div className="flex items-center gap-2">
                                {playlist.visibility === "PUBLIC" && (
                                    <Globe className="w-4 h-4 text-green-500" />
                                )}
                                {playlist.visibility === "PRIVATE" && (
                                    <Lock className="w-4 h-4 text-red-500" />
                                )}
                                {playlist.visibility === "UNLISTED" && (
                                    <EyeOff className="w-4 h-4 text-yellow-500" />
                                )}
                                <span className="text-xs font-semibold capitalize tracking-tight">
                                    {playlist.visibility.toLowerCase()}
                                </span>
                            </div>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-[#1f1f23] border-white/10">
                        <DropdownMenuItem
                            onClick={() => handleVisibilityChange("PUBLIC")}
                            className="gap-2"
                        >
                            <Globe className="w-4 h-4 text-green-500" /> Public
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => handleVisibilityChange("UNLISTED")}
                            className="gap-2"
                        >
                            <EyeOff className="w-4 h-4 text-yellow-500" />{" "}
                            Unlisted
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => handleVisibilityChange("PRIVATE")}
                            className="gap-2"
                        >
                            <Lock className="w-4 h-4 text-red-500" /> Private
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div className="col-span-2 flex flex-col justify-center text-xs">
                <p className="font-semibold">
                    {new Date(playlist.updatedAt).toLocaleDateString("en-US", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                    })}
                </p>
                <p className="text-muted-foreground mt-0.5 font-medium opacity-60 uppercase text-[10px] tracking-widest">
                    Last updated
                </p>
            </div>

            <div className="col-span-2 flex items-center justify-end gap-3 pr-6">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-white/10"
                        >
                            <MoreVertical className="w-4 h-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="end"
                        className="w-48 bg-[#1f1f23] border-white/10 shadow-2xl"
                    >
                        <DropdownMenuItem
                            onClick={handleCopyLink}
                            className="gap-2"
                        >
                            <Share2 className="w-4 h-4" /> Get shareable link
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={handleDelete}
                            className="gap-2 text-red-500 focus:text-red-400"
                        >
                            <Trash className="w-4 h-4" /> Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
};
