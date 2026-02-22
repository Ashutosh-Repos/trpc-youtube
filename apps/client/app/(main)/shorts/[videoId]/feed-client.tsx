"use client";

import React, { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { ShortsClient } from "./client";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@youtube/server/src/trpc/router";
import { Loader2 } from "lucide-react";

type VideoData = inferRouterOutputs<AppRouter>["video"]["getPublicVideo"];

interface ShortsFeedClientProps {
    initialVideo: VideoData;
}

export function ShortsFeedClient({ initialVideo }: ShortsFeedClientProps) {
    const [activeVideoId, setActiveVideoId] = useState<string>(initialVideo.id);
    const containerRef = useRef<HTMLDivElement>(null);

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
        trpc.feed.getHomeShorts.useInfiniteQuery(
            {},
            {
                getNextPageParam: (lastPage: any) => lastPage.nextCursor,
            },
        );

    // Merge initial video with feed shorts, ensuring no duplicates
    const feedVideos =
        data?.pages.flatMap((page: any) => page.videos || []) || [];

    // Create the final list by putting the initial video first, then appending others.
    const videos = [
        initialVideo,
        ...feedVideos.filter((v: any) => v.id !== initialVideo.id),
    ];

    // Handle scroll snapping detection to sync active video
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        let debounceTimer: NodeJS.Timeout;

        const handleScroll = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                // Find which video is most visible
                const children = Array.from(
                    container.children,
                ) as HTMLElement[];
                let maxVisibleIdx = 0;
                let maxVisibleRatio = 0;

                const containerHeight = container.clientHeight;

                children.forEach((child, idx) => {
                    const rect = child.getBoundingClientRect();
                    const visibleHeight =
                        Math.min(rect.bottom, containerHeight) -
                        Math.max(rect.top, 0);
                    const visibleRatio = visibleHeight / child.clientHeight;

                    if (visibleRatio > maxVisibleRatio) {
                        maxVisibleRatio = visibleRatio;
                        maxVisibleIdx = idx;
                    }
                });

                const currentIsLast = maxVisibleIdx === videos.length - 1;

                // If we scrolled to the last element, fetch more
                if (currentIsLast && hasNextPage && !isFetchingNextPage) {
                    fetchNextPage();
                }

                if (videos[maxVisibleIdx]) {
                    const newActiveId = videos[maxVisibleIdx].id;
                    if (newActiveId !== activeVideoId) {
                        setActiveVideoId(newActiveId);
                        // Shallow route update to keep shareability
                        window.history.replaceState(
                            null,
                            "",
                            `/shorts/${newActiveId}`,
                        );
                    }
                }
            }, 100); // 100ms debounce
        };

        container.addEventListener("scroll", handleScroll);
        return () => {
            container.removeEventListener("scroll", handleScroll);
            clearTimeout(debounceTimer);
        };
    }, [videos, activeVideoId, hasNextPage, isFetchingNextPage, fetchNextPage]);

    return (
        <div
            ref={containerRef}
            className="flex flex-col h-[calc(100vh-64px)] w-full overflow-y-auto snap-y snap-mandatory hide-scrollbar bg-[#0f0f0f] sm:bg-transparent"
        >
            {videos.map((video) => (
                <div
                    key={video.id}
                    className="h-full w-full shrink-0 snap-always snap-center flex items-center justify-center"
                >
                    <ShortsClient
                        video={video as any}
                        isActive={video.id === activeVideoId}
                    />
                </div>
            ))}
            {isFetchingNextPage && (
                <div className="h-full w-full shrink-0 snap-always snap-center flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-white" />
                </div>
            )}
        </div>
    );
}
