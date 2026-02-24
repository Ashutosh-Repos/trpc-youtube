"use client";

import React, { useEffect } from "react";
import { useInView } from "react-intersection-observer";
import { VideoCard } from "./video-card";
import { Loader2 } from "lucide-react";
import type { HydratedVideo } from "@youtube/server/src/services/FeedService";
import { ShortsShelf } from "./shorts-shelf";

interface InfiniteVideoGridProps {
    videos: HydratedVideo[];
    isLoading: boolean;
    isFetchingNextPage: boolean;
    hasNextPage: boolean;
    fetchNextPage: () => void;
    error: unknown;
    emptyMessage?: string;
    showShortsShelf?: "home" | "trending" | false;
}

export function InfiniteVideoGrid({
    videos,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    emptyMessage = "No videos found.",
    showShortsShelf = false,
}: InfiniteVideoGridProps) {
    const { ref, inView } = useInView({
        threshold: 0,
        rootMargin: "400px", // Trigger earlier
    });

    useEffect(() => {
        if (inView && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

    if (error) {
        return (
            <div className="w-full flex items-center justify-center py-20 text-destructive">
                Failed to load feed.
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-10 mt-6 relative z-0">
                {Array.from({ length: 12 }).map((_, i: number) => (
                    <div key={i} className="flex flex-col gap-3 animate-pulse">
                        <div className="aspect-video bg-muted rounded-xl w-full"></div>
                        <div className="flex gap-3 px-1">
                            <div className="w-9 h-9 rounded-full bg-muted shrink-0"></div>
                            <div className="flex flex-col gap-2 w-full pt-1">
                                <div className="h-4 bg-muted rounded w-[90%]"></div>
                                <div className="h-3 bg-muted rounded w-[60%]"></div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (!videos.length) {
        return (
            <div className="w-full flex items-center justify-center py-20 text-muted-foreground">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className="w-full pb-20 mt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-x-4 gap-y-10 relative z-0">
                {videos.map((video: HydratedVideo, idx: number) => (
                    <React.Fragment key={`${video.id}-${idx}`}>
                        <VideoCard video={video} />
                        {showShortsShelf && idx === 7 && (
                            <ShortsShelf source={showShortsShelf} />
                        )}
                    </React.Fragment>
                ))}
            </div>

            {/* Intersection trigger */}
            <div
                ref={ref}
                className="w-full h-20 mt-10 flex items-center justify-center"
            >
                {isFetchingNextPage && (
                    <Loader2
                        className="animate-spin text-muted-foreground"
                        size={24}
                    />
                )}
            </div>
        </div>
    );
}
