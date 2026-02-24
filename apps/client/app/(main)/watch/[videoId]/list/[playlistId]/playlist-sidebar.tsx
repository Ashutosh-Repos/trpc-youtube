"use client";

import React, { useEffect } from "react";
import {
    usePlaylistPlayerStore,
    PlaylistData,
} from "@/hooks/use-playlist-player";
import { PlaylistVideoCard } from "./playlist-video-card";
import { Button } from "@/components/ui/button";
import { Shuffle, Repeat } from "lucide-react";

interface PlaylistSidebarProps {
    playlistId: string;
    currentVideoId: string;
    /** Server-prefetched data. When present, avoids a client-side TRPC roundtrip. */
    initialData?: PlaylistData;
}

export function PlaylistSidebar({
    playlistId,
    currentVideoId,
    initialData,
}: PlaylistSidebarProps) {
    const store = usePlaylistPlayerStore();

    // Initialize from server data (no client fetch needed when initialData is provided)
    useEffect(() => {
        if (
            initialData &&
            (!store.isInitialized || store.playlistId !== playlistId)
        ) {
            store.initializePlaylist(initialData, currentVideoId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialData, currentVideoId, playlistId]);

    // Keep current index in sync with the URL's currentVideoId whenever navigation occurs
    useEffect(() => {
        if (store.isInitialized && store.playlistData) {
            const index = store.shuffledOrder.findIndex(
                (orderIndex) =>
                    store.playlistData?.videos[orderIndex].id ===
                    currentVideoId,
            );
            if (index !== -1 && store.currentIndex !== index) {
                store.setCurrentIndex(index);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentVideoId]);

    if (!store.isInitialized || !store.playlistData) {
        return (
            <div className="bg-secondary/20 border rounded-xl p-4 animate-pulse h-[400px] mb-6">
                <div className="h-6 bg-secondary rounded w-3/4 mb-4" />
                <div className="h-4 bg-secondary rounded w-1/2 mb-6" />
                <div className="flex gap-2 mb-6">
                    <div className="w-8 h-8 rounded-full bg-secondary" />
                    <div className="w-8 h-8 rounded-full bg-secondary" />
                </div>
                <div className="space-y-4 mt-4">
                    {[1, 2, 3, 4].map((i: number) => (
                        <div key={i} className="h-16 bg-secondary rounded" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-secondary/20 rounded-xl border flex flex-col max-h-[600px] overflow-hidden mb-6">
            <div className="p-4 border-b bg-secondary/10">
                <h3 className="font-semibold text-lg line-clamp-2">
                    {store.playlistData.title}
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                    {store.playlistData.authorName} • {store.currentIndex + 1} /{" "}
                    {store.playlistData.videos.length}
                </p>
                <div className="flex gap-2 mt-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        className={`rounded-full hover:bg-secondary/40 ${store.isLooped ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                        onClick={store.toggleLoop}
                        aria-label="Loop playlist"
                    >
                        <Repeat className="w-5 h-5" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={`rounded-full hover:bg-secondary/40 ${store.isShuffled ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
                        onClick={store.toggleShuffle}
                        aria-label="Shuffle playlist"
                    >
                        <Shuffle className="w-5 h-5" />
                    </Button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {store.shuffledOrder.map((orderIndex: number, i: number) => {
                    const video = store.playlistData!.videos[orderIndex];
                    const isPlaying = i === store.currentIndex;
                    return (
                        <PlaylistVideoCard
                            key={`${video.id}-${i}`}
                            video={video}
                            playlistId={playlistId}
                            isPlaying={isPlaying}
                            index={i + 1}
                        />
                    );
                })}
            </div>
        </div>
    );
}
