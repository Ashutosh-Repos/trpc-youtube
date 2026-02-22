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
                href={videoUrl}
                className="relative w-[168px] h-[94px] bg-secondary rounded-lg shrink-0 overflow-hidden"
            >
                <VideoHoverPreview
                    thumbnailUrl={getMediaUrl(video.thumbnailUrl)}
                    spriteUrl={getMediaUrl(video.previewSprite)}
                    duration={video.duration}
                />
                <div className="absolute bottom-1 right-1 bg-black/80 px-1 rounded text-[10px] font-medium text-white group-hover:opacity-0 transition-opacity">
                    {formatDuration(video.duration)}
                </div>
            </Link>
            <div className="flex flex-col gap-1 pr-4 min-w-0">
                <Link
                    href={videoUrl}
                    className="font-semibold text-sm line-clamp-2 leading-tight"
                >
                    {video.title}
                </Link>
                <Link
                    href={channelUrl}
                    className="text-xs text-muted-foreground line-clamp-1 mt-1 hover:text-foreground transition-colors"
                >
                    {video.channels.name}
                </Link>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <span>{formatViewCount(video.viewCount)} views</span>
                    <span>•</span>
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
