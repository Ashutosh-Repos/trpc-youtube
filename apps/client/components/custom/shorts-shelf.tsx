"use client";

import React from "react";
import { trpc } from "@/lib/trpc";
import { ShortCard } from "./short-card";
import { Youtube, X } from "lucide-react";

interface ShortsShelfProps {
    source: "home" | "trending";
}

export function ShortsShelf({ source }: ShortsShelfProps) {
    const [isVisible, setIsVisible] = React.useState(true);

    const query =
        source === "home"
            ? trpc.feed.getHomeShorts.useQuery({})
            : trpc.feed.getTrendingShorts.useQuery({});

    const { data, isLoading, error } = query;

    if (!isVisible) return null;

    if (isLoading) {
        return (
            <div className="col-span-full border-y border-border/40 py-6 my-4 w-full">
                <div className="flex animate-pulse gap-4 overflow-x-hidden px-2">
                    {Array.from({ length: 6 }).map((_: any, i: number) => (
                        <div
                            key={i}
                            className="w-[210px] aspect-9/16 bg-surface-2 rounded-2xl shrink-0 animate-pulse border border-border/10"
                        />
                    ))}
                </div>
            </div>
        );
    }

    if (error || !data?.videos || data.videos.length === 0) {
        return null; // Gracefully hide if no shorts exist
    }

    return (
        <div className="col-span-full border-y border-border/40 py-6 mb-8 mt-4 w-full relative">
            {/* Shelf Header */}
            <div className="flex items-center justify-between px-2 mb-6 w-full">
                <div className="flex items-center gap-2">
                    <Youtube
                        className="w-7 h-7 text-primary"
                        fill="currentColor"
                    />
                    <h2 className="text-xl font-black tracking-tighter uppercase text-foreground/90">
                        Shorts
                    </h2>
                </div>
                <button
                    onClick={() => setIsVisible(false)}
                    className="p-2 hover:bg-surface-2 rounded-full transition-all text-muted-foreground/60 hover:text-foreground active:scale-90"
                    title="Not interested"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Horizontal Scroller */}
            <div className="flex w-full overflow-x-auto snap-x snap-mandatory gap-4 px-2 pb-4 pt-2 -mx-2 hide-scrollbar">
                {data.videos.map((video: any) => (
                    <div key={video.id} className="snap-start shrink-0">
                        <ShortCard video={video} />
                    </div>
                ))}
            </div>
        </div>
    );
}
