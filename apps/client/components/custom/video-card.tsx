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
    const channelUrl = `/channel/@${video.channels.handle || video.channelId}`;

    return (
        <div className="flex flex-col gap-3 group bg-transparent w-full transition-all duration-300">
            {/* Thumbnail Wrapper */}
            <Link
                prefetch={false}
                href={videoUrl}
                className="relative aspect-video rounded-2xl overflow-hidden bg-surface-2 w-full border border-border/40 group-hover:shadow-[0_20px_50px_-15px_oklch(var(--primary)/0.2)] dark:group-hover:shadow-[0_20px_50px_-15px_oklch(var(--primary)/0.4)] transition-all duration-500 ease-out group-hover:-translate-y-1 active:scale-[0.98]"
            >
                <VideoHoverPreview
                    thumbnailUrl={getMediaUrl(video.thumbnailUrl)}
                    spriteUrl={getMediaUrl(video.previewSprite)}
                    duration={video.duration}
                />

                {/* Duration Badge */}
                {video.duration ? (
                    <div className="absolute bottom-2 right-2 bg-surface-3/90 backdrop-blur-md border border-border/20 text-foreground text-[10px] font-black tracking-widest uppercase px-1.5 py-0.5 rounded-lg transition-all duration-300 group-hover:scale-105 group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary shadow-lg">
                        {formatDuration(video.duration)}
                    </div>
                ) : null}
            </Link>

            {/* Info Section */}
            <div className="flex gap-3 items-start relative px-0.5">
                {!hideChannelInfo && (
                    <Link
                        prefetch={false}
                        href={channelUrl}
                        className="shrink-0 mt-1 transition-transform hover:scale-110 active:scale-90"
                        tabIndex={-1}
                    >
                        <Avatar className="h-10 w-10 border border-border/40 bg-surface-2 ring-2 ring-transparent group-hover:ring-primary/40 transition-all duration-500 shadow-sm">
                            <AvatarImage
                                src={getMediaUrl(video.channels.image)}
                                alt={video.channels.name || "Channel"}
                            />
                            <AvatarFallback className="font-bold text-xs bg-secondary">
                                {video.channels.name?.charAt(0) || "C"}
                            </AvatarFallback>
                        </Avatar>
                    </Link>
                )}

                <div className="flex flex-col overflow-hidden leading-[1.3]">
                    <Link
                        prefetch={false}
                        href={videoUrl}
                        className="font-bold text-[15px] line-clamp-2 pb-px tracking-tight group-hover:text-primary transition-colors duration-300"
                        title={video.title}
                    >
                        {video.title}
                    </Link>

                    <div className="flex flex-col gap-0.5 mt-1">
                        {!hideChannelInfo && (
                            <Link
                                prefetch={false}
                                href={channelUrl}
                                className="text-[13px] font-semibold text-muted-foreground/80 hover:text-primary transition-colors line-clamp-1 w-max"
                            >
                                {video.channels.name}
                            </Link>
                        )}

                        <div className="text-[12px] text-muted-foreground/60 flex gap-1.5 items-center font-medium">
                            <span className="uppercase tracking-wider">
                                {formatViewCount(video.viewCount)} views
                            </span>
                            <span className="w-1 h-1 rounded-full bg-border/40" />
                            <span className="uppercase tracking-wider">
                                {formatDistanceToNowStrict(
                                    new Date(video.createdAt),
                                )}{" "}
                                ago
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
