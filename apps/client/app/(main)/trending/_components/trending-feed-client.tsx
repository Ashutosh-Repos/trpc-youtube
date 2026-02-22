"use client";

import React, { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { InfiniteVideoGrid } from "@/components/custom/infinite-video-grid";
import type { HydratedVideo } from "@youtube/server/src/services/FeedService";

export function TrendingFeedClient() {
    // using useInfiniteQuery for seamless cursor pagination
    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
        error,
    } = trpc.feed.getTrendingFeed.useInfiniteQuery(
        {},
        {
            getNextPageParam: (lastPage) => lastPage.nextCursor,
            staleTime: 1000 * 60 * 5,
        },
    );

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
            emptyMessage="No trending videos available."
            showShortsShelf="trending"
        />
    );
}
