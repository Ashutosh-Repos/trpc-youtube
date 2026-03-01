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
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import Image from "next/image";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn, getMediaUrl } from "@/lib/utils";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

import { RouterOutputs } from "@/lib/trpc-shared";

interface PlaylistRowProps {
    playlist: RouterOutputs["playlist"]["getChannelPlaylists"]["playlists"][number];
    isSelected: boolean;
    onSelect: (checked: boolean) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onEdit?: (playlist: any) => void;
}

export const PlaylistRow = ({
    playlist,
    isSelected,
    onSelect,
    onEdit,
}: PlaylistRowProps) => {
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
                "grid grid-cols-12 gap-4 px-8 py-5 transition-all group relative border-b border-border/10",
                isSelected
                    ? "bg-primary/5 hover:bg-primary/10"
                    : "hover:bg-surface-1",
            )}
        >
            <div className="absolute left-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                <Checkbox
                    checked={isSelected}
                    onCheckedChange={(checked: boolean) => onSelect(!!checked)}
                    className="border-border/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary rounded-md h-5 w-5"
                />
            </div>
            <div className="col-span-6 flex gap-4 min-w-0">
                <div className="relative w-36 aspect-video rounded-xl overflow-hidden bg-surface-1 shrink-0 border border-border/10 shadow-lg group/playlist-thumb">
                    {playlist.thumbnailUrl || playlist.firstVideoThumbnail ? (
                        <Image
                            src={getMediaUrl(
                                playlist.thumbnailUrl ||
                                    playlist.firstVideoThumbnail,
                            )}
                            alt={playlist.title}
                            fill
                            className="object-cover"
                            onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                    "none";
                            }}
                        />
                    ) : (
                        <div className="flex flex-col items-center gap-1 opacity-20">
                            <ListVideo className="w-8 h-8" />
                        </div>
                    )}
                    <div className="absolute inset-y-0 right-0 w-1/3 bg-background/60 backdrop-blur-md flex flex-col items-center justify-center gap-1 group-hover/playlist-thumb:w-full transition-all duration-300">
                        <span className="text-[10px] font-black uppercase tracking-widest">
                            {playlist._count?.playlist_videos || 0}
                        </span>
                        <ListVideo className="w-4 h-4 text-foreground" />
                    </div>
                </div>

                <div className="flex flex-col justify-center min-w-0 pr-4">
                    <Link
                        href={`/studio/${playlist.channelId}/content/playlist/${playlist.id}`}
                        className="font-black text-[15px] truncate hover:text-primary transition-colors cursor-pointer tracking-tight text-foreground/90"
                    >
                        {playlist.title}
                    </Link>
                    <p className="text-[11px] text-muted-foreground/40 line-clamp-1 mt-1 font-black uppercase tracking-widest">
                        {playlist.description || "No description provided"}
                    </p>

                    <div className="flex items-center gap-0.5 mt-2.5 opacity-0 group-hover:opacity-100 transition-all translate-y-2 group-hover:translate-y-0 duration-300">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onEdit?.(playlist)}
                            className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary transition-all"
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
                            className="h-auto px-3 py-2 gap-2.5 rounded-xl hover:bg-surface-2 group/trigger transition-all border border-transparent hover:border-border/10"
                        >
                            <div className="flex items-center gap-2">
                                {playlist.visibility === "PUBLIC" && (
                                    <Globe className="w-4 h-4 text-emerald-500" />
                                )}
                                {playlist.visibility === "PRIVATE" && (
                                    <Lock className="w-4 h-4 text-destructive" />
                                )}
                                {playlist.visibility === "UNLISTED" && (
                                    <EyeOff className="w-4 h-4 text-amber-500" />
                                )}
                                <span className="text-[11px] font-black uppercase tracking-widest text-foreground/80 group-hover/trigger:text-foreground transition-colors">
                                    {playlist.visibility.toLowerCase()}
                                </span>
                            </div>
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-surface-3 border-border/10 text-foreground rounded-xl shadow-2xl p-1.5">
                        <DropdownMenuItem
                            onClick={() => handleVisibilityChange("PUBLIC")}
                            className="gap-2 focus:bg-primary/10 focus:text-primary rounded-lg transition-colors cursor-pointer"
                        >
                            <Globe className="w-4 h-4 text-emerald-500" />{" "}
                            Public
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => handleVisibilityChange("UNLISTED")}
                            className="gap-2 focus:bg-primary/10 focus:text-primary rounded-lg transition-colors cursor-pointer"
                        >
                            <EyeOff className="w-4 h-4 text-amber-500" />{" "}
                            Unlisted
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => handleVisibilityChange("PRIVATE")}
                            className="gap-2 focus:bg-primary/10 focus:text-primary rounded-lg transition-colors cursor-pointer"
                        >
                            <Lock className="w-4 h-4 text-destructive" />{" "}
                            Private
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            <div className="col-span-2 flex flex-col justify-center text-xs">
                <p className="font-black text-[13px] tracking-tight">
                    {new Date(playlist.updatedAt).toLocaleDateString("en-US", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                    })}
                </p>
                <p className="text-muted-foreground/40 mt-1 font-black uppercase text-[10px] tracking-widest">
                    Last updated
                </p>
            </div>

            <div className="col-span-2 flex items-center justify-end gap-3 pr-6">
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full hover:bg-primary/10 hover:text-primary transition-all"
                        >
                            <MoreVertical className="w-4 h-4" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        align="end"
                        className="w-56 bg-surface-3 border-border/10 text-foreground shadow-2xl rounded-xl p-1.5"
                    >
                        <DropdownMenuItem
                            onClick={handleCopyLink}
                            className="gap-2.5 focus:bg-primary/10 focus:text-primary rounded-lg transition-colors cursor-pointer"
                        >
                            <Share2 className="w-4 h-4 transition-transform group-hover:scale-110" />{" "}
                            Get shareable link
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={handleDelete}
                            className="gap-2.5 focus:bg-destructive/10 focus:text-destructive rounded-lg transition-colors cursor-pointer text-destructive/80"
                        >
                            <Trash className="w-4 h-4 transition-transform group-hover:scale-110" />{" "}
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
};
