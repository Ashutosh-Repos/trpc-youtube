import React from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatViewCount, getMediaUrl } from "@/lib/utils";
import { VideoHoverPreview } from "./video-hover-preview";
import { formatDistanceToNowStrict } from "date-fns";
import type { HydratedVideo } from "@youtube/server/src/services/FeedService";

interface VideoCardProps {
    video: HydratedVideo;
    hideChannelInfo?: boolean;
}

export function formatDuration(seconds: number | null): string {
    if (!seconds) return "0:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0)
        return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

export function VideoCard({ video, hideChannelInfo = false }: VideoCardProps) {
    const videoUrl = `/watch/${video.id}`;
    const channelUrl = `/@${video.channels.handle || video.channelId}`;

    return (
        <div className="flex flex-col gap-3 group bg-transparent w-full">
            <Link
                href={videoUrl}
                className="relative aspect-video rounded-xl overflow-hidden bg-neutral-900 w-full group-hover:rounded-none transition-all duration-300"
            >
                <VideoHoverPreview
                    thumbnailUrl={getMediaUrl(video.thumbnailUrl)}
                    spriteUrl={getMediaUrl(video.previewSprite)}
                    duration={video.duration}
                />

                {/* Duration Badge */}
                {video.duration ? (
                    <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs font-medium px-1.5 py-0.5 rounded transition-opacity group-hover:opacity-0">
                        {formatDuration(video.duration)}
                    </div>
                ) : null}
            </Link>

            <div className="flex gap-3 items-start relative px-1">
                {!hideChannelInfo && (
                    <Link
                        href={channelUrl}
                        className="shrink-0 mt-0.5"
                        tabIndex={-1}
                    >
                        <Avatar className="h-9 w-9 border border-border/10 bg-muted">
                            <AvatarImage
                                src={getMediaUrl(video.channels.image)}
                                alt={video.channels.name || "Channel"}
                            />
                            <AvatarFallback>
                                {video.channels.name?.charAt(0) || "C"}
                            </AvatarFallback>
                        </Avatar>
                    </Link>
                )}

                <div className="flex flex-col overflow-hidden leading-tight">
                    <Link
                        href={videoUrl}
                        className="font-semibold text-sm line-clamp-2 pb-[2px] transition-colors"
                        title={video.title}
                    >
                        {video.title}
                    </Link>

                    {!hideChannelInfo && (
                        <Link
                            href={channelUrl}
                            className="text-[13px] text-muted-foreground mt-0.5 hover:text-foreground transition-colors line-clamp-1 w-max"
                        >
                            {video.channels.name}
                        </Link>
                    )}

                    <div className="text-[13px] text-muted-foreground flex gap-1 items-center mt-0.5 line-clamp-1">
                        <span>{formatViewCount(video.viewCount)} views</span>
                        <span className="text-[10px]">•</span>
                        <span>
                            {formatDistanceToNowStrict(
                                new Date(video.createdAt),
                            )}{" "}
                            ago
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
