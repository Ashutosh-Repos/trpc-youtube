import React from "react";
import Link from "next/link";
import Image from "next/image";
import { formatViewCount, getMediaUrl } from "@/lib/utils";
import type { HydratedVideo } from "@youtube/server/src/services/FeedService";

interface ShortCardProps {
    video: HydratedVideo;
}

export function ShortCard({ video }: ShortCardProps) {
    const videoUrl = `/shorts/${video.id}`; // Crucial: Link to the Shorts player

    return (
        <Link
            prefetch={false}
            href={videoUrl}
            className="group relative flex w-[160px] sm:w-[190px] md:w-[210px] flex-col shrink-0 gap-2 cursor-pointer"
        >
            {/* 9:16 Container */}
            <div className="relative aspect-9/16 w-full overflow-hidden rounded-2xl transition-all duration-300 group-hover:rounded-none bg-surface-2 border border-border/10">
                {/* Fallback to original thumbnail if no vertical specific one exists, object-cover will handle it */}
                {video.thumbnailUrl ? (
                    <Image
                        src={getMediaUrl(video.thumbnailUrl)}
                        alt={video.title}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={(e) => {
                            (e.target as HTMLImageElement).style.display =
                                "none";
                        }}
                    />
                ) : null}

                {/* Bottom Gradient overlay */}
                <div className="absolute inset-0 bg-linear-to-t from-background/90 via-background/20 to-transparent opacity-90 transition-opacity duration-300" />

                {/* Text Overlay */}
                <div className="absolute bottom-0 left-0 flex w-full flex-col justify-end p-4 text-foreground">
                    <span
                        className="font-black text-sm line-clamp-2 leading-tight tracking-tight drop-shadow-sm"
                        title={video.title}
                    >
                        {video.title}
                    </span>
                    <span className="text-[11px] font-black uppercase tracking-widest text-foreground/60 mt-1.5 drop-shadow">
                        {formatViewCount(video.viewCount)} views
                    </span>
                </div>
            </div>
        </Link>
    );
}
