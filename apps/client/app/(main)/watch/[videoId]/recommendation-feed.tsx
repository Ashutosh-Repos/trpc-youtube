"use client";

import React, { useEffect } from "react";
import { trpc } from "@/lib/trpc";
import type { HydratedVideo } from "@youtube/server/src/services/FeedService";
import { CompactVideoCard } from "@/components/custom/compact-video-card";
import { useInView } from "react-intersection-observer";
import { Loader2 } from "lucide-react";

export function RecommendationFeed({ videoId }: { videoId: string }) {
    const { ref, inView } = useInView();

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
        trpc.feed.getRecommendations.useInfiniteQuery(
            { videoId },
            {
                getNextPageParam: (lastPage: any) => lastPage.nextCursor,
            },
        );

    useEffect(() => {
        if (inView && hasNextPage && !isFetchingNextPage) {
            fetchNextPage();
        }
    }, [inView, hasNextPage, isFetchingNextPage, fetchNextPage]);

    const videos = data?.pages.flatMap((page: any) => page.videos) || [];

    if (isLoading) {
        return (
            <div className="flex flex-col gap-2">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="flex gap-2">
                        <div className="w-[168px] h-[94px] bg-secondary rounded-lg shrink-0 animate-pulse" />
                        <div className="flex flex-col gap-2 w-full py-1">
                            <div className="h-4 bg-secondary rounded animate-pulse w-full m-0" />
                            <div className="h-4 bg-secondary rounded animate-pulse w-3/4 m-0" />
                            <div className="h-3 bg-secondary rounded animate-pulse w-1/2 mt-2" />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    if (videos.length === 0) {
        return (
            <div className="py-8 text-center text-sm text-muted-foreground">
                No recommendations available.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-2">
            {videos.map((video: HydratedVideo) => (
                <CompactVideoCard
                    key={video.id + Math.random()}
                    video={video}
                />
            ))}

            <div
                ref={ref}
                className="py-4 flex justify-center items-center h-12"
            >
                {isFetchingNextPage && (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                )}
            </div>
        </div>
    );
}
