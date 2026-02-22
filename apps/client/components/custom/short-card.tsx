import React from "react";
import Link from "next/link";
import { formatViewCount, getMediaUrl } from "@/lib/utils";
import type { HydratedVideo } from "@youtube/server/src/services/FeedService";

interface ShortCardProps {
    video: HydratedVideo;
}

export function ShortCard({ video }: ShortCardProps) {
    const videoUrl = `/shorts/${video.id}`; // Crucial: Link to the Shorts player

    return (
        <Link
            href={videoUrl}
            className="group relative flex w-[160px] sm:w-[190px] md:w-[210px] flex-col shrink-0 gap-2 cursor-pointer"
        >
            {/* 9:16 Container */}
            <div className="relative aspect-9/16 w-full overflow-hidden rounded-xl transition-all duration-300 group-hover:rounded-none bg-muted">
                {/* Fallback to original thumbnail if no vertical specific one exists, object-cover will handle it */}
                {video.thumbnailUrl ? (
                    <img
                        src={getMediaUrl(video.thumbnailUrl)}
                        alt={video.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                ) : null}

                {/* Bottom Gradient overlay */}
                <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/20 to-transparent opacity-90 transition-opacity duration-300" />

                {/* Text Overlay */}
                <div className="absolute bottom-0 left-0 flex w-full flex-col justify-end p-3 text-white">
                    <span
                        className="font-medium text-sm line-clamp-2 leading-snug drop-shadow-md"
                        title={video.title}
                    >
                        {video.title}
                    </span>
                    <span className="text-[13px] text-white/90 mt-1.5 drop-shadow">
                        {formatViewCount(video.viewCount)} views
                    </span>
                </div>
            </div>
        </Link>
    );
}
