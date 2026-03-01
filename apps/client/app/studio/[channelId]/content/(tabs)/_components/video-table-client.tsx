"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { InfiniteData } from "@tanstack/react-query";
import { RouterOutputs } from "@/lib/trpc-shared";

import { VideoRow } from "../../_components/video-row";
import { VideoPlaylistSelector } from "../../_components/video-playlist-selector";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Trash2,
    Globe,
    Lock,
    EyeOff,
    ListVideo,
    Zap,
    VideoIcon,
} from "lucide-react";

interface VideoTableClientProps {
    channelId: string;
    isShort: boolean;
    initialData: InfiniteData<
        RouterOutputs["video"]["getChannelContent"],
        string | undefined
    >;
}

export function VideoTableClient({
    channelId,
    isShort,
    initialData,
}: VideoTableClientProps) {
    const utils = trpc.useUtils();
    const searchParams = useSearchParams();

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isPlaylistSelectorOpen, setIsPlaylistSelectorOpen] = useState(false);
    const [selectorVideoIds, setSelectorVideoIds] = useState<string[]>([]);

    const search = searchParams.get("search") || undefined;
    const visibilityFilter = searchParams.get("visibility") as
        | "PUBLIC"
        | "PRIVATE"
        | "UNLISTED"
        | undefined;

    // Convert string to boolean for TRPC
    const ageRestrictedParam = searchParams.get("isAgeRestricted");
    const ageFilter =
        ageRestrictedParam === "true"
            ? true
            : ageRestrictedParam === "false"
              ? false
              : undefined;
    const sortOrder =
        (searchParams.get("sortOrder") as "newest" | "oldest" | "views") ||
        "newest";

    const contentQuery = trpc.video.getChannelContent.useInfiniteQuery(
        {
            channelId,
            isShort,
            search,
            visibility: visibilityFilter,
            isAgeRestricted: ageFilter,
            sortOrder,
            limit: 30,
        },
        {
            getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
            initialData,
            placeholderData: (prev) => prev,
            refetchOnMount: false, // Since we hydrate from server
        },
    );

    const allItems = contentQuery.data?.pages.flatMap((p) => p.items) ?? [];
    const totalCount = contentQuery.data?.pages[0]?.totalCount ?? 0;

    // ─── Mutations ──────────────────────────────────────────────────────

    const deleteVideosMutation = trpc.video.deleteVideos.useMutation({
        onSuccess: (data) => {
            toast.success(
                `Deleted ${data.count} video${data.count !== 1 ? "s" : ""}`,
            );
            setSelectedIds([]);
            utils.video.getChannelContent.invalidate();
        },
        onError: (error) => {
            toast.error(error.message || "Failed to delete videos");
        },
    });

    const updateVisibilityMutation =
        trpc.video.updateVideosVisibility.useMutation({
            onSuccess: (data) => {
                toast.success(
                    `Updated visibility for ${data.count} video${data.count !== 1 ? "s" : ""}`,
                );
                setSelectedIds([]);
                utils.video.getChannelContent.invalidate();
            },
            onError: (error) => {
                toast.error(error.message || "Failed to update visibility");
            },
        });

    const isPending =
        deleteVideosMutation.isPending || updateVisibilityMutation.isPending;

    // ─── Handlers ───────────────────────────────────────────────────────

    const toggleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(allItems.map((i) => i.id));
        } else {
            setSelectedIds([]);
        }
    };

    const toggleSelect = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedIds((prev) => [...prev, id]);
        } else {
            setSelectedIds((prev) => prev.filter((i) => i !== id));
        }
    };

    const handleBulkDelete = () => {
        if (
            !window.confirm(
                `Are you sure you want to delete ${selectedIds.length} video(s)?`,
            )
        )
            return;
        deleteVideosMutation.mutate({ channelId, videoIds: selectedIds });
    };

    const handleBulkVisibility = (
        visibility: "PUBLIC" | "PRIVATE" | "UNLISTED",
    ) => {
        updateVisibilityMutation.mutate({
            channelId,
            videoIds: selectedIds,
            visibility,
        });
    };

    // Infinite scroll
    const sentinelRef = useRef<HTMLDivElement>(null);
    const handleLoadMore = useCallback(() => {
        if (contentQuery.hasNextPage && !contentQuery.isFetchingNextPage) {
            contentQuery.fetchNextPage();
        }
    }, [contentQuery]);

    useEffect(() => {
        const el = sentinelRef.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    handleLoadMore();
                }
            },
            { rootMargin: "200px" },
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, [handleLoadMore]);

    // ─── Render ─────────────────────────────────────────────────────────

    if (allItems.length === 0 && !contentQuery.isLoading) {
        return (
            <div className="h-full flex flex-col items-center justify-center text-center p-20 space-y-6">
                <div className="w-24 h-24 rounded-3xl bg-surface-2 flex items-center justify-center rotate-3 hover:rotate-0 transition-transform duration-500 shadow-xl border border-border/10">
                    {isShort ? (
                        <Zap className="w-10 h-10 text-muted-foreground/20" />
                    ) : (
                        <VideoIcon className="w-10 h-10 text-muted-foreground/20" />
                    )}
                </div>
                <div className="space-y-2">
                    <h3 className="text-3xl font-black tracking-tighter uppercase text-foreground/90 leading-tight">
                        No {isShort ? "shorts" : "videos"} available
                    </h3>
                    <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/40 max-w-sm mx-auto">
                        You haven&apos;t uploaded any{" "}
                        {isShort ? "shorts" : "videos"} matching these filters
                        yet.
                    </p>
                </div>
                <Button
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest text-[11px] h-12 px-10 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center gap-3"
                    onClick={() => toast.info("Upload flow coming soon!")}
                >
                    <Zap className="w-4 h-4 fill-current" /> Upload video
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background w-full min-w-[1000px]">
            {/* Selection Toolbar (Bulk Actions) */}
            {selectedIds.length > 0 && (
                <div className="bg-primary/10 border-b border-primary/20 px-8 py-3 flex items-center justify-between animate-in slide-in-from-top-1 duration-300 backdrop-blur-md sticky top-0 z-30">
                    <div className="flex items-center gap-6">
                        <span className="text-[11px] font-black uppercase tracking-widest text-primary">
                            {selectedIds.length} video
                            {selectedIds.length !== 1 ? "s" : ""} selected
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedIds([])}
                            className="h-8 text-primary/60 hover:text-primary hover:bg-primary/10 font-black uppercase tracking-widest text-[10px] rounded-lg px-4 transition-all"
                        >
                            Clear
                        </Button>
                    </div>
                    <div className="flex items-center gap-2">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={isPending}
                                    className="h-10 border-primary/20 bg-primary/5 hover:bg-primary/10 gap-2.5 font-black text-[10px] tracking-widest uppercase rounded-xl text-primary transition-all px-5"
                                >
                                    <Globe className="w-3.5 h-3.5" />
                                    Visibility
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="bg-surface-3 border-border/10 text-foreground rounded-xl p-1.5 shadow-2xl">
                                <DropdownMenuItem
                                    onClick={() =>
                                        handleBulkVisibility("PUBLIC")
                                    }
                                    className="gap-2.5 focus:bg-primary/10 focus:text-primary rounded-lg transition-colors cursor-pointer"
                                >
                                    <Globe className="w-4 h-4 text-emerald-500" />{" "}
                                    Public
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() =>
                                        handleBulkVisibility("PRIVATE")
                                    }
                                    className="gap-2.5 focus:bg-primary/10 focus:text-primary rounded-lg transition-colors cursor-pointer"
                                >
                                    <Lock className="w-4 h-4 text-destructive" />{" "}
                                    Private
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() =>
                                        handleBulkVisibility("UNLISTED")
                                    }
                                    className="gap-2.5 focus:bg-primary/10 focus:text-primary rounded-lg transition-colors cursor-pointer"
                                >
                                    <EyeOff className="w-4 h-4 text-amber-500" />{" "}
                                    Unlisted
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>

                        <Button
                            size="sm"
                            variant="outline"
                            disabled={isPending}
                            onClick={() => {
                                setSelectorVideoIds(selectedIds);
                                setIsPlaylistSelectorOpen(true);
                            }}
                            className="h-10 border-primary/20 bg-primary/5 hover:bg-primary/10 gap-2.5 font-black text-[10px] tracking-widest uppercase rounded-xl text-primary transition-all px-5"
                        >
                            <ListVideo className="w-3.5 h-3.5" />
                            To Playlist
                        </Button>

                        <Button
                            size="sm"
                            variant="destructive"
                            disabled={isPending}
                            onClick={handleBulkDelete}
                            className="h-10 gap-2.5 font-black text-[10px] tracking-widest uppercase rounded-xl px-6 shadow-lg shadow-destructive/20 transition-all active:scale-95"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                        </Button>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-auto custom-scrollbar">
                {/* Table Header */}
                <div className="grid grid-cols-12 gap-4 px-8 py-5 border-b border-border/10 bg-background sticky top-0 z-20">
                    <div className="col-span-5 flex gap-4">
                        <div className="flex items-center">
                            <Checkbox
                                checked={
                                    selectedIds.length === allItems.length &&
                                    allItems.length > 0
                                }
                                onCheckedChange={(checked) =>
                                    toggleSelectAll(!!checked)
                                }
                                className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                            />
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 ml-4">
                            {selectedIds.length > 0
                                ? `${selectedIds.length} Selected`
                                : "Video"}
                        </span>
                    </div>
                    <div className="col-span-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 flex items-center">
                        Visibility
                    </div>
                    <div className="col-span-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 flex items-center">
                        Date
                    </div>
                    <div className="col-span-1 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 flex items-center justify-end">
                        Views
                    </div>
                    <div className="col-span-2 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 flex items-center justify-end pr-8">
                        Comments
                    </div>
                </div>

                {/* Loading skeleton */}
                {contentQuery.isLoading && allItems.length === 0 ? (
                    <div className="divide-y divide-white/5">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div
                                key={i}
                                className="grid grid-cols-12 gap-4 px-6 py-4 animate-pulse"
                            >
                                <div className="col-span-5 flex gap-4">
                                    <div className="w-5 h-5 rounded bg-surface-2" />
                                    <div className="w-32 h-20 rounded-xl bg-surface-2" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 w-3/4 bg-surface-2 rounded-lg" />
                                        <div className="h-3 w-1/2 bg-surface-2 rounded-lg" />
                                    </div>
                                </div>
                                <div className="col-span-2 flex items-center">
                                    <div className="h-3 w-16 bg-surface-2 rounded shrink-0" />
                                </div>
                                <div className="col-span-2 flex items-center">
                                    <div className="h-3 w-20 bg-surface-2 rounded shrink-0" />
                                </div>
                                <div className="col-span-1 flex items-center justify-end">
                                    <div className="h-3 w-8 bg-surface-2 rounded shrink-0" />
                                </div>
                                <div className="col-span-2 flex items-center justify-end pr-8">
                                    <div className="h-3 w-8 bg-surface-2 rounded shrink-0" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <>
                        <div className="divide-y divide-border/10">
                            {allItems.map((video) => (
                                <VideoRow
                                    key={video.id}
                                    video={video}
                                    channelId={channelId}
                                    isSelected={selectedIds.includes(video.id)}
                                    onSelect={(checked) =>
                                        toggleSelect(video.id, checked)
                                    }
                                    onSaveToPlaylist={(id) => {
                                        setSelectorVideoIds([id]);
                                        setIsPlaylistSelectorOpen(true);
                                    }}
                                />
                            ))}
                        </div>

                        {/* Footer / Infinite scroll sentinel */}
                        <div className="p-12 flex flex-col items-center gap-6 border-t border-border/10 bg-surface-1/30">
                            {contentQuery.hasNextPage && (
                                <div ref={sentinelRef}>
                                    {contentQuery.isFetchingNextPage ? (
                                        <div className="flex items-center gap-3 text-primary">
                                            <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                            <span className="text-[10px] font-black uppercase tracking-[0.2em] animate-pulse">
                                                Loading more...
                                            </span>
                                        </div>
                                    ) : (
                                        <Button
                                            variant="outline"
                                            onClick={handleLoadMore}
                                            className="h-12 px-10 border-border/10 bg-surface-2 hover:bg-surface-3 font-black text-[11px] tracking-widest uppercase rounded-xl transition-all shadow-sm"
                                        >
                                            Load More Content
                                        </Button>
                                    )}
                                </div>
                            )}
                            <p className="text-[10px] text-muted-foreground/20 font-black uppercase tracking-[0.3em]">
                                Showing {allItems.length} of {totalCount} videos
                            </p>
                        </div>
                    </>
                )}
            </div>

            <VideoPlaylistSelector
                channelId={channelId}
                videoIds={selectorVideoIds}
                isOpen={isPlaylistSelectorOpen}
                onClose={() => {
                    setIsPlaylistSelectorOpen(false);
                    setSelectorVideoIds([]);
                }}
            />
        </div>
    );
}
