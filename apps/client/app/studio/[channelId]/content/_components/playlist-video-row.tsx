"use client";

import { Trash2, GripVertical, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMediaUrl } from "@/lib/utils";
import Image from "next/image";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

import { DraggableProvided } from "@hello-pangea/dnd";

interface PlaylistVideoRowProps {
    playlistId: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    const { innerRef, draggableProps, dragHandleProps } = provided;

    return (
        <div
            ref={innerRef}
            {...draggableProps}
            className="grid grid-cols-12 gap-4 px-8 py-4 hover:bg-surface-1 transition-all group items-center border-b border-border/10"
        >
            <div className="col-span-1 flex items-center gap-4">
                <div {...dragHandleProps}>
                    <GripVertical className="w-4 h-4 text-muted-foreground/60 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing hover:text-primary transition-colors" />
                </div>
                <span className="text-muted-foreground/40 text-[11px] font-black uppercase tracking-widest tabular-nums">
                    {video.position + 1}
                </span>
            </div>

            <div className="col-span-8 flex gap-4 min-w-0">
                <div className="relative w-28 aspect-video rounded-xl bg-surface-2 overflow-hidden shrink-0 border border-border/10 shadow-lg group/video-thumb">
                    <Image
                        src={getMediaUrl(video.thumbnailUrl)}
                        alt={video.title}
                        fill
                        className="object-cover"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                                "none";
                        }}
                    />
                    <div className="absolute inset-0 bg-surface-3/40 backdrop-blur-[2px] opacity-0 group-hover/video-thumb:opacity-100 transition-all flex items-center justify-center">
                        <Play className="w-8 h-8 text-primary fill-primary drop-shadow-[0_0_10px_oklch(var(--primary)/0.4)]" />
                    </div>
                </div>
                <div className="flex flex-col justify-center min-w-0">
                    <p className="font-black text-[14px] truncate tracking-tight text-foreground/90 group-hover:text-primary transition-colors">
                        {video.title}
                    </p>
                    <p className="text-[10px] text-muted-foreground/40 mt-1 uppercase tracking-[0.2em] font-black">
                        {video.visibility.toLowerCase()} • {video.views} views
                    </p>
                </div>
            </div>

            <div className="col-span-3 flex items-center justify-end pr-8">
                <Button
                    variant="ghost"
                    size="icon"
                    disabled={removeVideoMutation.isPending}
                    onClick={handleRemove}
                    className="h-9 w-9 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-destructive/10 hover:text-destructive"
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
};
