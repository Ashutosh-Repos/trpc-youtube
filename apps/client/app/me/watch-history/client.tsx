"use client";

import { Button } from "@/components/ui/button";
import { getMediaUrl } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { format, isToday, isYesterday } from "date-fns";
import { Loader2, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState, forwardRef } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface HistoryItemProps {
    item: any; // Type inference from trpc makes this messy to define explicitly without generated types
    onRemove: () => void;
}

const HistoryItem = forwardRef<HTMLDivElement, HistoryItemProps>(
    ({ item, onRemove }, ref) => {
        const video = item.videos;
        const progressPercent =
            video.duration && item.watchedSeconds
                ? Math.min((item.watchedSeconds / video.duration) * 100, 100)
                : 0;

        return (
            <div
                ref={ref}
                className="flex flex-col md:flex-row gap-4 group hover:bg-secondary/20 p-2 rounded-xl transition-colors relative"
            >
                {/* Thumbnail */}
                <div className="relative aspect-video w-full md:w-[240px] shrink-0 rounded-xl overflow-hidden bg-secondary">
                    <Link href={`/watch/${video.id}`}>
                        <img
                            src={getMediaUrl(video.thumbnailUrl)}
                            alt={video.title}
                            className="w-full h-full object-cover"
                        />
                        {/* Duration Badge */}
                        {video.duration && (
                            <div className="absolute bottom-2 right-2 bg-black/80 px-1 py-0.5 rounded text-xs font-medium text-white">
                                {formatDuration(video.duration)}
                            </div>
                        )}
                        {/* Progress Bar */}
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                            <div
                                className="h-full bg-red-600"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </Link>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col gap-1">
                    <div className="flex justify-between items-start gap-2">
                        <Link href={`/watch/${video.id}`} className="min-w-0">
                            <h3 className="font-semibold text-base line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                                {video.title}
                            </h3>
                        </Link>
                        {/* Mobile Remove Button (visible on hover/menu) */}
                        <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 shrink-0"
                            onClick={(e) => {
                                e.preventDefault();
                                onRemove();
                            }}
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    <div className="text-sm text-muted-foreground flex flex-col gap-1">
                        <Link
                            href={`/@${video.channels.handle || video.channels.id}`}
                            className="hover:text-foreground transition-colors"
                        >
                            {video.channelName || video.channels.name}
                        </Link>
                        <div className="flex items-center gap-1">
                            <span>{video.viewCount} views</span>
                            <span>•</span>
                            <span>
                                {format(new Date(video.createdAt), "PP")}
                            </span>
                        </div>
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {video.description}
                    </div>
                </div>
            </div>
        );
    },
);
HistoryItem.displayName = "HistoryItem";

function formatDuration(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) {
        return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    return `${m}:${s.toString().padStart(2, "0")}`;
}

export function HistoryClient() {
    const utils = trpc.useUtils();
    const [searchQuery, setSearchQuery] = useState(""); // Future proofing

    const {
        data,
        fetchNextPage,
        hasNextPage,
        isFetchingNextPage,
        isLoading,
        isError,
    } = trpc.history.getHistory.useInfiniteQuery(
        {
            limit: 20,
        },
        {
            getNextPageParam: (lastPage) => lastPage.nextCursor,
        },
    );

    const removeFromHistoryMutation =
        trpc.history.removeFromHistory.useMutation({
            onSuccess: () => {
                toast.success("Removed from watch history");
                utils.history.getHistory.invalidate();
            },
            onError: () => {
                toast.error("Failed to remove video");
            },
        });

    const clearHistoryMutation = trpc.history.clearHistory.useMutation({
        onSuccess: () => {
            toast.success("Watch history cleared");
            utils.history.getHistory.invalidate();
        },
        onError: () => {
            toast.error("Failed to clear history");
        },
    });

    // Intersection Observer for Infinite Scroll
    const observer = useRef<IntersectionObserver | null>(null);
    const lastElementRef = useCallback(
        (node: HTMLDivElement | null) => {
            if (isFetchingNextPage) return;
            if (observer.current) observer.current.disconnect();
            observer.current = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && hasNextPage) {
                    fetchNextPage();
                }
            });
            if (node) observer.current.observe(node);
        },
        [isFetchingNextPage, hasNextPage, fetchNextPage],
    );

    // Grouping Logic
    const groupedHistory = useMemo(() => {
        if (!data) return [];
        const groups: { title: string; items: any[] }[] = [];
        const today: any[] = [];
        const yesterday: any[] = [];
        const older: any[] = [];

        data.pages.forEach((page) => {
            page.items.forEach((item) => {
                const date = new Date(item.lastWatchedAt);
                if (isToday(date)) {
                    today.push(item);
                } else if (isYesterday(date)) {
                    yesterday.push(item);
                } else {
                    older.push(item);
                }
            });
        });

        if (today.length > 0) groups.push({ title: "Today", items: today });
        if (yesterday.length > 0)
            groups.push({ title: "Yesterday", items: yesterday });
        if (older.length > 0) groups.push({ title: "Older", items: older });

        return groups;
    }, [data]);

    if (isLoading) {
        return (
            <div className="flex justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    if (isError) {
        return (
            <div className="text-center py-20 text-muted-foreground">
                Failed to load watch history.
            </div>
        );
    }

    const isEmpty = !data?.pages[0]?.items.length;

    return (
        <div className="flex flex-col gap-6 p-4 md:p-6 max-w-5xl mx-auto w-full">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Watch History</h1>
                {!isEmpty && (
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                            if (
                                confirm(
                                    "Are you sure you want to clear your entire watch history?",
                                )
                            ) {
                                clearHistoryMutation.mutate();
                            }
                        }}
                        disabled={clearHistoryMutation.isPending}
                    >
                        {clearHistoryMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                            <Trash2 className="h-4 w-4 mr-2" />
                        )}
                        Clear all watch history
                    </Button>
                )}
            </div>

            {isEmpty ? (
                <div className="text-center py-20 text-muted-foreground">
                    You have no watch history yet.
                </div>
            ) : (
                <div className="flex flex-col gap-8">
                    {/* Groups */}
                    {groupedHistory.map((group) => (
                        <div key={group.title} className="flex flex-col gap-4">
                            <h2 className="text-lg font-semibold text-muted-foreground">
                                {group.title}
                            </h2>
                            <div className="flex flex-col gap-4">
                                {group.items.map((item, index) => {
                                    const isLast =
                                        index === group.items.length - 1 &&
                                        group.title ===
                                            groupedHistory[
                                                groupedHistory.length - 1
                                            ].title;
                                    return (
                                        <HistoryItem
                                            key={item.id} // use history ID, unique
                                            item={item}
                                            ref={isLast ? lastElementRef : null}
                                            onRemove={() =>
                                                removeFromHistoryMutation.mutate(
                                                    {
                                                        videoId: item.videoId,
                                                    },
                                                )
                                            }
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    {isFetchingNextPage && (
                        <div className="flex justify-center py-4">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
