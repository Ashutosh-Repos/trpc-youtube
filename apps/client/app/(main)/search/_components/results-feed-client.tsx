"use client";

import React, { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { InfiniteVideoGrid } from "@/components/custom/infinite-video-grid";
import type { HydratedVideo } from "@youtube/server/src/services/FeedService";
import { useSearchParams } from "next/navigation";
import { ChannelSearchCard } from "@/components/custom/channel-search-card";
import { PlaylistSearchCard } from "@/components/custom/playlist-search-card";

export function ResultsFeedClient() {
    const searchParams = useSearchParams();
    const query = searchParams.get("q") || "";

    // using useInfiniteQuery for seamless cursor pagination
    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
        error,
    } = trpc.search.globalSearch.useInfiniteQuery(
        { query, limit: 20 },
        {
            getNextPageParam: (lastPage) => lastPage.nextCursor,
            enabled: !!query,
            staleTime: 1000 * 60 * 5,
        },
    );

    const videos = useMemo(() => {
        if (!data?.pages) return [];
        return data.pages.flatMap((page) => page.items) as HydratedVideo[];
    }, [data]);

    const channels = useMemo(() => {
        if (!data?.pages || data.pages.length === 0) return [];
        return data.pages[0].channels || [];
    }, [data]);

    const playlists = useMemo(() => {
        if (!data?.pages || data.pages.length === 0) return [];
        return data.pages[0].playlists || [];
    }, [data]);

    if (!query) {
        return (
            <div className="w-full flex items-center justify-center py-20 text-muted-foreground">
                Please enter a search query.
            </div>
        );
    }

    return (
        <div className="flex flex-col w-full max-w-[1000px] mx-auto pb-20 pt-6">
            {channels.length > 0 && (
                <div className="flex flex-col w-full mb-6">
                    {channels.map((c: any) => (
                        <ChannelSearchCard key={c.id} channel={c} />
                    ))}
                </div>
            )}

            {playlists.length > 0 && (
                <div className="flex flex-col w-full mb-8">
                    {playlists.map((p: any) => (
                        <PlaylistSearchCard key={p.id} playlist={p} />
                    ))}
                    <hr className="border-border/10 mt-6" />
                </div>
            )}

            <InfiniteVideoGrid
                videos={videos}
                fetchNextPage={fetchNextPage}
                hasNextPage={!!hasNextPage}
                isFetchingNextPage={isFetchingNextPage}
                isLoading={isLoading}
                error={error}
                emptyMessage={`No results found for "${query}"`}
            />
        </div>
    );
}
