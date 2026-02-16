"use client";

import { Trash2, GripVertical, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, getMediaUrl } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

import { DraggableProvided } from "@hello-pangea/dnd";

interface PlaylistVideoRowProps {
    playlistId: string;
    video: any;
    onRemove: () => void;
    provided: DraggableProvided;
}

export const PlaylistVideoRow = ({
    playlistId,
    video,
    onRemove,
    provided,
}: PlaylistVideoRowProps) => {
    const removeVideoMutation =
        trpc.playlist.removeVideoFromPlaylist.useMutation({
            onSuccess: () => {
                toast.success("Removed from playlist");
                onRemove();
            },
            onError: (error) => {
                toast.error(error.message || "Failed to remove video");
            },
        });

    const handleRemove = () => {
        removeVideoMutation.mutate({ playlistId, videoId: video.id });
    };

    return (
        <div
            ref={provided.innerRef}
            {...provided.draggableProps}
            className="grid grid-cols-12 gap-4 px-6 py-3 hover:bg-white/5 transition-colors group items-center border-b border-white/5"
        >
            <div className="col-span-1 flex items-center gap-4">
                <div {...provided.dragHandleProps}>
                    <GripVertical className="w-4 h-4 text-zinc-600 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing hover:text-white transition-colors" />
                </div>
                <span className="text-zinc-500 text-xs font-bold tabular-nums">
                    {video.position + 1}
                </span>
            </div>

            <div className="col-span-8 flex gap-4 min-w-0">
                <div className="relative w-24 aspect-video rounded bg-zinc-900 overflow-hidden shrink-0 border border-white/5">
                    <img
                        src={getMediaUrl(video.thumbnailUrl)}
                        alt={video.title}
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Play className="w-5 h-5 text-white fill-white" />
                    </div>
                </div>
                <div className="flex flex-col justify-center min-w-0">
                    <p className="font-semibold text-sm truncate tracking-tight">
                        {video.title}
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider font-bold">
                        {video.visibility.toLowerCase()} • {video.views} views
                    </p>
                </div>
            </div>

            <div className="col-span-3 flex items-center justify-end pr-4">
                <Button
                    variant="ghost"
                    size="icon"
                    disabled={removeVideoMutation.isPending}
                    onClick={handleRemove}
                    className="h-9 w-9 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/10 hover:text-red-500"
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
};
