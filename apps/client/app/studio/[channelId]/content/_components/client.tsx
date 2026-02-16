"use client";

import {
    useState,
    useDeferredValue,
    useRef,
    useCallback,
    useEffect,
} from "react";
import { trpc } from "@/lib/trpc";
import {
    Search,
    Filter,
    X,
    VideoIcon,
    Zap,
    ListVideo,
    Trash2,
    Globe,
    Lock,
    EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { RouterOutputs } from "@/lib/trpc-shared";

import { VideoRow } from "./video-row";
import { PlaylistList } from "./playlist-list";
import { PlaylistFormModal } from "./playlist-form-modal";
import { VideoPlaylistSelector } from "./video-playlist-selector";

import { InfiniteData } from "@tanstack/react-query";

interface ContentClientProps {
    channelId: string;
    channelName: string;
    initialVideos?: InfiniteData<
        RouterOutputs["video"]["getChannelContent"],
        string | undefined
    >;
}

const ContentClient = ({
    channelId,
    channelName,
    initialVideos,
}: ContentClientProps) => {
    const utils = trpc.useUtils();

    // UI-only state
    const [activeTab, setActiveTab] = useState("videos");
    const [search, setSearch] = useState("");
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState(false);
    const [editingPlaylist, setEditingPlaylist] = useState<
        | RouterOutputs["playlist"]["getChannelPlaylists"]["playlists"][number]
        | null
    >(null);
    const [isPlaylistSelectorOpen, setIsPlaylistSelectorOpen] = useState(false);
    const [selectorVideoIds, setSelectorVideoIds] = useState<string[]>([]);

    // Filters
    const [visibilityFilter, setVisibilityFilter] = useState<
        string | undefined
    >(undefined);
    const [ageFilter, setAgeFilter] = useState<boolean | undefined>(undefined);
    const [sortOrder, setSortOrder] = useState<"newest" | "oldest" | "views">(
        "newest",
    );

    // Debounced search — React 19 useDeferredValue defers to next render
    const deferredSearch = useDeferredValue(search);

    // Derive isShort from tab
    const isShort =
        activeTab === "shorts"
            ? true
            : activeTab === "videos"
              ? false
              : undefined;

    // ─── Data Fetching ──────────────────────────────────────────────────

    const contentQuery = trpc.video.getChannelContent.useInfiniteQuery(
        {
            channelId,
            isShort,
            search: deferredSearch || undefined,
            visibility: visibilityFilter as
                | "PUBLIC"
                | "PRIVATE"
                | "UNLISTED"
                | undefined,
            isAgeRestricted: ageFilter,
            sortOrder,
            limit: 30,
        },
        {
            getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
            initialData:
                activeTab === "videos" &&
                !search &&
                !visibilityFilter &&
                ageFilter === undefined &&
                sortOrder === "newest"
                    ? initialVideos
                    : undefined,
            enabled: activeTab !== "playlists",
            // Keep previous data so tab switches don't flash empty
            placeholderData: (prev) => prev,
        },
    );

    const playlistsQuery = trpc.playlist.getChannelPlaylists.useQuery(
        { channelId },
        { enabled: activeTab === "playlists" },
    );

    // Flatten infinite query pages into a single list
    const allItems = contentQuery.data?.pages.flatMap((p) => p.items) ?? [];
    const totalCount = contentQuery.data?.pages[0]?.totalCount ?? 0;
    const playlists = playlistsQuery.data?.playlists ?? [];

    const isFetching =
        activeTab === "playlists"
            ? playlistsQuery.isFetching
            : contentQuery.isFetching;

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

    // ─── Handlers ───────────────────────────────────────────────────────

    const onTabChange = (value: string) => {
        setActiveTab(value);
        setSelectedIds([]);
    };

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
                `Are you sure you want to delete ${selectedIds.length} videos?`,
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

    // Infinite scroll — IntersectionObserver on sentinel
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

    const isPending =
        deleteVideosMutation.isPending || updateVisibilityMutation.isPending;

    // ─── Render ─────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full bg-[#0f0f0f]">
            <div className="p-6 border-b border-white/5 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-white">
                            Channel content
                        </h1>
                        <p className="text-sm text-zinc-400">
                            Manage your channel's videos and reels.
                        </p>
                    </div>
                    <Button
                        className="bg-primary hover:bg-primary/90 text-black font-bold"
                        onClick={() => {
                            if (activeTab === "playlists") {
                                setIsPlaylistModalOpen(true);
                            } else {
                                toast.info("Upload flow coming soon!");
                            }
                        }}
                    >
                        Create
                    </Button>
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                    <div className="flex bg-zinc-900 border border-white/5 p-1 rounded-lg">
                        <button
                            onClick={() => onTabChange("videos")}
                            className={cn(
                                "px-5 py-2 rounded-md transition-all gap-2 font-medium flex items-center text-sm",
                                activeTab === "videos"
                                    ? "bg-zinc-800 text-white"
                                    : "text-zinc-400 hover:text-zinc-200",
                            )}
                        >
                            <VideoIcon className="w-4 h-4" /> Videos
                        </button>
                        <button
                            onClick={() => onTabChange("shorts")}
                            className={cn(
                                "px-5 py-2 rounded-md transition-all gap-2 font-medium flex items-center text-sm",
                                activeTab === "shorts"
                                    ? "bg-zinc-800 text-white"
                                    : "text-zinc-400 hover:text-zinc-200",
                            )}
                        >
                            <Zap className="w-4 h-4" /> Shorts
                        </button>

                        <button
                            onClick={() => onTabChange("playlists")}
                            className={cn(
                                "px-5 py-2 rounded-md transition-all gap-2 font-medium flex items-center text-sm",
                                activeTab === "playlists"
                                    ? "bg-zinc-800 text-white"
                                    : "text-zinc-400 hover:text-zinc-200",
                            )}
                        >
                            <ListVideo className="w-4 h-4" /> Playlists
                        </button>
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <div className="relative group flex-1 md:w-72">
                            <Search
                                className={cn(
                                    "absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors",
                                    isFetching
                                        ? "text-primary animate-pulse"
                                        : "text-zinc-500 group-focus-within:text-primary",
                                )}
                            />
                            <Input
                                placeholder="Filter videos..."
                                className="pl-10 bg-zinc-900 border-white/5 focus-visible:ring-primary/20 transition-all h-10 text-sm"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button
                                    variant="outline"
                                    size="icon"
                                    className={cn(
                                        "h-10 w-10 border-white/5 bg-zinc-900 hover:bg-zinc-800 transition-colors",
                                        (visibilityFilter ||
                                            ageFilter !== undefined ||
                                            sortOrder !== "newest") &&
                                            "border-primary/50 text-primary",
                                    )}
                                >
                                    <Filter className="w-4 h-4" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent
                                align="end"
                                className="w-[280px] bg-[#1a1a1e] border-white/10 p-4 space-y-4 shadow-2xl"
                            >
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                                            Visibility
                                        </Label>
                                        <Select
                                            value={visibilityFilter || "all"}
                                            onValueChange={(v) =>
                                                setVisibilityFilter(
                                                    v === "all" ? undefined : v,
                                                )
                                            }
                                        >
                                            <SelectTrigger className="bg-black/20 border-white/5 h-9 text-xs">
                                                <SelectValue placeholder="All" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1f1f23] border-white/10 text-white">
                                                <SelectItem value="all">
                                                    All
                                                </SelectItem>
                                                <SelectItem value="PUBLIC">
                                                    Public
                                                </SelectItem>
                                                <SelectItem value="PRIVATE">
                                                    Private
                                                </SelectItem>
                                                <SelectItem value="UNLISTED">
                                                    Unlisted
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                                            Age Restriction
                                        </Label>
                                        <Select
                                            value={
                                                ageFilter === undefined
                                                    ? "all"
                                                    : ageFilter.toString()
                                            }
                                            onValueChange={(v) =>
                                                setAgeFilter(
                                                    v === "all"
                                                        ? undefined
                                                        : v === "true",
                                                )
                                            }
                                        >
                                            <SelectTrigger className="bg-black/20 border-white/5 h-9 text-xs">
                                                <SelectValue placeholder="All" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1f1f23] border-white/10 text-white">
                                                <SelectItem value="all">
                                                    All
                                                </SelectItem>
                                                <SelectItem value="true">
                                                    Yes
                                                </SelectItem>
                                                <SelectItem value="false">
                                                    No
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                                            Sort By
                                        </Label>
                                        <Select
                                            value={sortOrder}
                                            onValueChange={(v) =>
                                                setSortOrder(v as any)
                                            }
                                        >
                                            <SelectTrigger className="bg-black/20 border-white/5 h-9 text-xs">
                                                <SelectValue placeholder="Newest" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-[#1f1f23] border-white/10 text-white">
                                                <SelectItem value="newest">
                                                    Newest first
                                                </SelectItem>
                                                <SelectItem value="oldest">
                                                    Oldest first
                                                </SelectItem>
                                                <SelectItem value="views">
                                                    Most views
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <Button
                                        variant="ghost"
                                        className="w-full h-8 text-[10px] font-bold border-t border-white/5 mt-2 hover:bg-white/5"
                                        onClick={() => {
                                            setVisibilityFilter(undefined);
                                            setAgeFilter(undefined);
                                            setSortOrder("newest");
                                        }}
                                    >
                                        RESET FILTERS
                                    </Button>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                </div>
            </div>

            {/* Selection Toolbar (Bulk Actions) */}
            {selectedIds.length > 0 && (
                <div className="bg-primary/10 border-b border-primary/20 px-6 py-2 flex items-center justify-between animate-in slide-in-from-top-1 duration-300">
                    <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-primary">
                            {selectedIds.length} selected
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedIds([])}
                            className="h-8 text-zinc-400 hover:text-white"
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
                                    className="h-8 border-white/10 bg-white/5 hover:bg-white/10 gap-2 font-bold text-[10px] tracking-widest uppercase"
                                >
                                    <Globe className="w-3.5 h-3.5" />
                                    Visibility
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="bg-[#1f1f23] border-white/10 text-white">
                                <DropdownMenuItem
                                    onClick={() =>
                                        handleBulkVisibility("PUBLIC")
                                    }
                                    className="gap-2 focus:bg-white/10"
                                >
                                    <Globe className="w-4 h-4 text-green-500" />{" "}
                                    Public
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() =>
                                        handleBulkVisibility("PRIVATE")
                                    }
                                    className="gap-2 focus:bg-white/10"
                                >
                                    <Lock className="w-4 h-4 text-red-500" />{" "}
                                    Private
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() =>
                                        handleBulkVisibility("UNLISTED")
                                    }
                                    className="gap-2 focus:bg-white/10"
                                >
                                    <EyeOff className="w-4 h-4 text-yellow-500" />{" "}
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
                            className="h-8 gap-2 font-bold text-[10px] tracking-widest uppercase px-4 border-white/10 bg-white/5 hover:bg-white/10"
                        >
                            <ListVideo className="w-3.5 h-3.5" />
                            To Playlist
                        </Button>

                        <Button
                            size="sm"
                            variant="destructive"
                            disabled={isPending}
                            onClick={handleBulkDelete}
                            className="h-8 gap-2 font-bold text-[10px] tracking-widest uppercase px-4"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete
                        </Button>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-auto custom-scrollbar">
                {/* Loading skeleton */}
                {contentQuery.isLoading && activeTab !== "playlists" ? (
                    <div className="divide-y divide-white/5">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div
                                key={i}
                                className="grid grid-cols-12 gap-4 px-6 py-4 animate-pulse"
                            >
                                <div className="col-span-5 flex gap-4">
                                    <div className="w-5 h-5 rounded bg-zinc-800" />
                                    <div className="w-32 h-20 rounded bg-zinc-800" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 w-3/4 bg-zinc-800 rounded" />
                                        <div className="h-3 w-1/2 bg-zinc-800 rounded" />
                                    </div>
                                </div>
                                <div className="col-span-2 flex items-center">
                                    <div className="h-3 w-16 bg-zinc-800 rounded" />
                                </div>
                                <div className="col-span-2 flex items-center">
                                    <div className="h-3 w-20 bg-zinc-800 rounded" />
                                </div>
                                <div className="col-span-1 flex items-center justify-end">
                                    <div className="h-3 w-8 bg-zinc-800 rounded" />
                                </div>
                                <div className="col-span-2 flex items-center justify-end">
                                    <div className="h-3 w-8 bg-zinc-800 rounded" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : playlistsQuery.isLoading && activeTab === "playlists" ? (
                    <div className="divide-y divide-white/5">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div
                                key={i}
                                className="grid grid-cols-12 gap-4 px-6 py-4 animate-pulse"
                            >
                                <div className="col-span-6 flex gap-4">
                                    <div className="w-5 h-5 rounded bg-zinc-800" />
                                    <div className="w-32 h-20 rounded bg-zinc-800" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 w-3/4 bg-zinc-800 rounded" />
                                    </div>
                                </div>
                                <div className="col-span-2 flex items-center">
                                    <div className="h-3 w-16 bg-zinc-800 rounded" />
                                </div>
                                <div className="col-span-2 flex items-center">
                                    <div className="h-3 w-20 bg-zinc-800 rounded" />
                                </div>
                                <div className="col-span-2 flex items-center justify-end">
                                    <div className="h-3 w-8 bg-zinc-800 rounded" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : allItems.length === 0 && activeTab !== "playlists" ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-4">
                        <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center">
                            <VideoIcon className="w-10 h-10 text-zinc-700" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="font-bold text-lg text-white">
                                No {activeTab} available
                            </h3>
                            <p className="text-sm text-zinc-500 max-w-xs mx-auto">
                                You haven't uploaded any {activeTab} yet.
                            </p>
                        </div>
                        <Button
                            className="font-bold gap-2"
                            onClick={() =>
                                toast.info("Upload flow coming soon!")
                            }
                        >
                            <Zap className="w-4 h-4" /> Upload video
                        </Button>
                    </div>
                ) : activeTab === "playlists" && playlists.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-12 space-y-4">
                        <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center">
                            <ListVideo className="w-10 h-10 text-zinc-700" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="font-bold text-lg text-white">
                                No playlists yet
                            </h3>
                            <p className="text-sm text-zinc-500 max-w-xs mx-auto">
                                Playlists are a great way to group videos
                                together for your viewers.
                            </p>
                        </div>
                        <Button
                            className="font-bold gap-2 bg-primary text-black hover:bg-primary/90"
                            onClick={() => setIsPlaylistModalOpen(true)}
                        >
                            <ListVideo className="w-4 h-4" /> Create playlist
                        </Button>
                    </div>
                ) : (
                    <div className="w-full min-w-[1000px]">
                        {activeTab === "playlists" ? (
                            <PlaylistList
                                playlists={playlists}
                                selectedIds={selectedIds}
                                onSelect={(id, checked) =>
                                    toggleSelect(id, checked)
                                }
                                onSelectAll={(checked) =>
                                    toggleSelectAll(checked)
                                }
                                onEdit={(p) => {
                                    setEditingPlaylist(p);
                                    setIsPlaylistModalOpen(true);
                                }}
                            />
                        ) : (
                            <>
                                {/* Table Header */}
                                <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-white/5 bg-[#0f0f0f] sticky top-0 z-20">
                                    <div className="col-span-5 flex gap-4">
                                        <div className="flex items-center">
                                            <Checkbox
                                                checked={
                                                    selectedIds.length ===
                                                        allItems.length &&
                                                    allItems.length > 0
                                                }
                                                onCheckedChange={(checked) =>
                                                    toggleSelectAll(!!checked)
                                                }
                                                className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                            />
                                        </div>
                                        <span className="text-xs font-bold uppercase tracking-widest text-zinc-500 ml-4">
                                            {selectedIds.length > 0
                                                ? `${selectedIds.length} Selected`
                                                : "Video"}
                                        </span>
                                    </div>
                                    <div className="col-span-2 text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center">
                                        Visibility
                                    </div>
                                    <div className="col-span-2 text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center">
                                        Date
                                    </div>
                                    <div className="col-span-1 text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center justify-end">
                                        Views
                                    </div>
                                    <div className="col-span-2 text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center justify-end pr-8">
                                        Comments
                                    </div>
                                </div>

                                {/* Table Rows */}
                                <div className="divide-y divide-white/5">
                                    {allItems.map((video) => (
                                        <VideoRow
                                            key={video.id}
                                            video={video}
                                            channelId={channelId}
                                            isSelected={selectedIds.includes(
                                                video.id,
                                            )}
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
                                <div className="p-8 flex flex-col items-center gap-4 border-t border-white/5">
                                    {contentQuery.hasNextPage && (
                                        <div ref={sentinelRef}>
                                            {contentQuery.isFetchingNextPage ? (
                                                <div className="flex items-center gap-2 text-zinc-400">
                                                    <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                                                    <span className="text-xs font-bold uppercase tracking-widest">
                                                        Loading more...
                                                    </span>
                                                </div>
                                            ) : (
                                                <Button
                                                    variant="outline"
                                                    onClick={handleLoadMore}
                                                    className="h-10 px-8 border-white/10 hover:bg-white/5 font-bold text-xs tracking-widest uppercase"
                                                >
                                                    Load More
                                                </Button>
                                            )}
                                        </div>
                                    )}
                                    <p className="text-[10px] text-zinc-600 font-bold uppercase tracking-widest">
                                        Showing {allItems.length} of{" "}
                                        {totalCount} videos
                                    </p>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            <PlaylistFormModal
                channelId={channelId}
                playlist={editingPlaylist || undefined}
                isOpen={isPlaylistModalOpen}
                onClose={() => {
                    setIsPlaylistModalOpen(false);
                    setEditingPlaylist(null);
                }}
                onSuccess={() => {
                    utils.playlist.getChannelPlaylists.invalidate();
                }}
            />

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
};

export default ContentClient;
