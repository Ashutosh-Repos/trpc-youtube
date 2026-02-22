"use client";

import React, { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { InfiniteVideoGrid } from "@/components/custom/infinite-video-grid";
import type { HydratedVideo } from "@youtube/server/src/services/FeedService";

export function HomeFeedClient() {
    // using useInfiniteQuery for seamless cursor pagination
    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
        error,
    } = trpc.feed.getHomeFeed.useInfiniteQuery(
        {},
        {
            getNextPageParam: (lastPage) => lastPage.nextCursor,
            // Keep fresh for a decent amount of time to prevent layout thrashing
            staleTime: 1000 * 60 * 5,
        },
    );

    // Flatten pages into a single generic array of videos
    const videos = useMemo(() => {
        if (!data?.pages) return [];
        return data.pages.flatMap((page) => page.videos) as HydratedVideo[];
    }, [data]);

    return (
        <InfiniteVideoGrid
            videos={videos}
            fetchNextPage={fetchNextPage}
            hasNextPage={!!hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            isLoading={isLoading}
            error={error}
            emptyMessage="No videos found in your feed."
            showShortsShelf="home"
        />
    );
}
