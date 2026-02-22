import React from "react";
import Link from "next/link";
import { getMediaUrl } from "@/lib/utils";
import { formatDuration } from "@/components/custom/video-card";
import type { PlaylistVideo } from "@/hooks/use-playlist-player";
import { Play } from "lucide-react";
import Image from "next/image";

interface PlaylistVideoCardProps {
    video: PlaylistVideo;
    playlistId: string;
    isPlaying: boolean;
    index: number;
}

export function PlaylistVideoCard({
    video,
    playlistId,
    isPlaying,
    index,
}: PlaylistVideoCardProps) {
    const videoUrl = `/watch/${video.id}/list/${playlistId}`;

    return (
        <Link
            href={videoUrl}
            className={`flex gap-3 group cursor-pointer items-center p-2 rounded-lg transition-colors ${
                isPlaying ? "bg-secondary/50" : "hover:bg-secondary/30"
            }`}
        >
            <div className="w-6 shrink-0 flex justify-center text-xs text-muted-foreground group-hover:hidden">
                {isPlaying ? (
                    <Play className="w-4 h-4 fill-current text-primary" />
                ) : (
                    index
                )}
            </div>
            <div className="w-6 shrink-0 hidden group-hover:flex justify-center text-xs text-muted-foreground">
                <Play className="w-4 h-4 fill-current" />
            </div>

            <div className="relative w-[100px] h-[56px] bg-secondary rounded overflow-hidden shrink-0">
                {video.thumbnailUrl && (
                    <Image
                        src={getMediaUrl(video.thumbnailUrl)}
                        alt={video.title}
                        fill
                        className="object-cover"
                    />
                )}
                <div className="absolute bottom-1 right-1 bg-black/80 px-1 rounded text-[10px] font-medium text-white">
                    {formatDuration(video.duration)}
                </div>
            </div>

            <div className="flex flex-col gap-1 min-w-0 py-1">
                <div
                    className={`font-medium text-sm line-clamp-2 leading-tight ${isPlaying ? "text-foreground" : "text-foreground/90"}`}
                >
                    {video.title}
                </div>
                <div className="text-xs text-muted-foreground line-clamp-1">
                    {video.channelName}
                </div>
            </div>
        </Link>
    );
}
