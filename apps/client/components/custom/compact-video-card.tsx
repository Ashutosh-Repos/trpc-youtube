import React from "react";
import Link from "next/link";
import { formatViewCount, getMediaUrl } from "@/lib/utils";
import { VideoHoverPreview } from "./video-hover-preview";
import { formatDistanceToNowStrict } from "date-fns";
import type { HydratedVideo } from "@youtube/server/src/services/FeedService";
import { formatDuration } from "./video-card";

interface CompactVideoCardProps {
    video: HydratedVideo;
}

export function CompactVideoCard({ video }: CompactVideoCardProps) {
    const videoUrl = `/watch/${video.id}`;
    const channelUrl = `/@${video.channels.handle || video.channels.id}`;

    return (
        <div className="flex gap-2 group cursor-pointer items-start w-full">
            <Link
                prefetch={false}
                href={videoUrl}
                className="relative w-[168px] h-[94px] bg-surface-2 rounded-xl shrink-0 overflow-hidden border border-border/10 group-hover:shadow-lg transition-all"
            >
                <VideoHoverPreview
                    thumbnailUrl={getMediaUrl(video.thumbnailUrl)}
                    spriteUrl={getMediaUrl(video.previewSprite)}
                    duration={video.duration}
                />
                <div className="absolute bottom-1 right-1 bg-surface-3/90 backdrop-blur-md px-1.5 py-0.5 rounded-lg border border-border/20 text-[10px] font-black tracking-widest text-foreground group-hover:scale-105 transition-all">
                    {formatDuration(video.duration)}
                </div>
            </Link>
            <div className="flex flex-col gap-1 pr-4 min-w-0">
                <Link
                    prefetch={false}
                    href={videoUrl}
                    className="font-semibold text-sm line-clamp-2 leading-tight"
                >
                    {video.title}
                </Link>
                <Link
                    prefetch={false}
                    href={channelUrl}
                    className="text-[12px] font-black uppercase tracking-widest text-muted-foreground/40 hover:text-primary transition-colors line-clamp-1 mt-1"
                >
                    {video.channels.name}
                </Link>
                <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/30 flex items-center gap-2">
                    <span>{formatViewCount(video.viewCount)} views</span>
                    <span className="w-1 h-1 rounded-full bg-border/40" />
                    <span>
                        {formatDistanceToNowStrict(new Date(video.createdAt), {
                            addSuffix: true,
                        })}
                    </span>
                </div>
            </div>
        </div>
    );
}
