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
        <div className="flex flex-col h-full bg-background">
            <div className="p-8 border-b border-border/10 space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-black tracking-tighter uppercase text-foreground/90">
                            Channel content
                        </h1>
                        <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/40 mt-1">
                            Manage your channel's videos and reels.
                        </p>
                    </div>
                    <Button
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest text-[11px] h-10 px-8 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95"
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
                    <div className="flex bg-surface-1 border border-border/10 p-1.5 rounded-2xl shadow-inner">
                        <button
                            onClick={() => onTabChange("videos")}
                            className={cn(
                                "px-6 py-2.5 rounded-xl transition-all gap-2 font-black uppercase tracking-widest text-[10px] flex items-center shadow-sm",
                                activeTab === "videos"
                                    ? "bg-surface-2 text-foreground ring-1 ring-border/10"
                                    : "text-muted-foreground/40 hover:text-foreground",
                            )}
                        >
                            <VideoIcon className="w-3.5 h-3.5" /> Videos
                        </button>
                        <button
                            onClick={() => onTabChange("shorts")}
                            className={cn(
                                "px-6 py-2.5 rounded-xl transition-all gap-2 font-black uppercase tracking-widest text-[10px] flex items-center shadow-sm",
                                activeTab === "shorts"
                                    ? "bg-surface-2 text-foreground ring-1 ring-border/10"
                                    : "text-muted-foreground/40 hover:text-foreground",
                            )}
                        >
                            <Zap className="w-3.5 h-3.5" /> Shorts
                        </button>

                        <button
                            onClick={() => onTabChange("playlists")}
                            className={cn(
                                "px-6 py-2.5 rounded-xl transition-all gap-2 font-black uppercase tracking-widest text-[10px] flex items-center shadow-sm",
                                activeTab === "playlists"
                                    ? "bg-surface-2 text-foreground ring-1 ring-border/10"
                                    : "text-muted-foreground/40 hover:text-foreground",
                            )}
                        >
                            <ListVideo className="w-3.5 h-3.5" /> Playlists
                        </button>
                    </div>

                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <div className="relative group flex-1 md:w-72">
                            <Search
                                className={cn(
                                    "absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-colors",
                                    isFetching
                                        ? "text-primary animate-pulse"
                                        : "text-muted-foreground/30 group-focus-within:text-primary",
                                )}
                            />
                            <Input
                                placeholder="Filter videos..."
                                className="pl-10 bg-surface-1 border-border/10 focus-visible:ring-primary/20 transition-all h-10 text-[11px] font-black uppercase tracking-widest rounded-xl"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                            {search && (
                                <button
                                    onClick={() => setSearch("")}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/30 hover:text-foreground transition-colors"
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
                                        "h-10 w-10 border-border/10 bg-surface-1 hover:bg-surface-2 transition-all rounded-xl",
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
                                className="w-[280px] bg-surface-3/95 backdrop-blur-2xl border-border/40 p-4 space-y-4 shadow-2xl rounded-3xl"
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
                                            <SelectTrigger className="bg-surface-1 border-border/10 h-10 text-[11px] font-black uppercase tracking-widest rounded-xl focus:ring-primary/20 transition-all">
                                                <SelectValue placeholder="All" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-surface-3 border-border/40 text-foreground rounded-2xl p-1.5 shadow-2xl">
                                                <SelectItem
                                                    value="all"
                                                    className="focus:bg-primary/10 focus:text-primary rounded-lg"
                                                >
                                                    {" "}
                                                    All{" "}
                                                </SelectItem>
                                                <SelectItem
                                                    value="PUBLIC"
                                                    className="focus:bg-primary/10 focus:text-primary rounded-lg"
                                                >
                                                    {" "}
                                                    Public{" "}
                                                </SelectItem>
                                                <SelectItem
                                                    value="PRIVATE"
                                                    className="focus:bg-primary/10 focus:text-primary rounded-lg"
                                                >
                                                    {" "}
                                                    Private{" "}
                                                </SelectItem>
                                                <SelectItem
                                                    value="UNLISTED"
                                                    className="focus:bg-primary/10 focus:text-primary rounded-lg"
                                                >
                                                    {" "}
                                                    Unlisted{" "}
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
                                            <SelectTrigger className="bg-surface-1 border-border/10 h-10 text-[11px] font-black uppercase tracking-widest rounded-xl focus:ring-primary/20 transition-all">
                                                <SelectValue placeholder="All" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-surface-3 border-border/40 text-foreground rounded-2xl p-1.5 shadow-2xl">
                                                <SelectItem
                                                    value="all"
                                                    className="focus:bg-primary/10 focus:text-primary rounded-lg"
                                                >
                                                    {" "}
                                                    All{" "}
                                                </SelectItem>
                                                <SelectItem
                                                    value="true"
                                                    className="focus:bg-primary/10 focus:text-primary rounded-lg"
                                                >
                                                    {" "}
                                                    Yes{" "}
                                                </SelectItem>
                                                <SelectItem
                                                    value="false"
                                                    className="focus:bg-primary/10 focus:text-primary rounded-lg"
                                                >
                                                    {" "}
                                                    No{" "}
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
                                            <SelectTrigger className="bg-surface-1 border-border/10 h-10 text-[11px] font-black uppercase tracking-widest rounded-xl focus:ring-primary/20 transition-all">
                                                <SelectValue placeholder="Newest" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-surface-3 border-border/40 text-foreground rounded-2xl p-1.5 shadow-2xl">
                                                <SelectItem
                                                    value="newest"
                                                    className="focus:bg-primary/10 focus:text-primary rounded-lg"
                                                >
                                                    {" "}
                                                    Newest first{" "}
                                                </SelectItem>
                                                <SelectItem
                                                    value="oldest"
                                                    className="focus:bg-primary/10 focus:text-primary rounded-lg"
                                                >
                                                    {" "}
                                                    Oldest first{" "}
                                                </SelectItem>
                                                <SelectItem
                                                    value="views"
                                                    className="focus:bg-primary/10 focus:text-primary rounded-lg"
                                                >
                                                    {" "}
                                                    Most views{" "}
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <Button
                                        variant="ghost"
                                        className="w-full h-10 text-[10px] font-black uppercase tracking-[0.2em] border-t border-border/10 mt-2 hover:bg-primary/10 hover:text-primary rounded-xl transition-all"
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
                <div className="bg-primary/10 border-b border-primary/20 px-8 py-3 flex items-center justify-between animate-in slide-in-from-top-1 duration-300 backdrop-blur-md">
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
                {/* Loading skeleton */}
                {contentQuery.isLoading && activeTab !== "playlists" ? (
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
                ) : playlistsQuery.isLoading && activeTab === "playlists" ? (
                    <div className="divide-y divide-white/5">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div
                                key={i}
                                className="grid grid-cols-12 gap-4 px-6 py-4 animate-pulse"
                            >
                                <div className="col-span-6 flex gap-4">
                                    <div className="w-5 h-5 rounded bg-surface-2" />
                                    <div className="w-32 h-20 rounded-xl bg-surface-2" />
                                    <div className="flex-1 space-y-2">
                                        <div className="h-4 w-3/4 bg-surface-2 rounded-lg" />
                                    </div>
                                </div>
                                <div className="col-span-2 flex items-center">
                                    <div className="h-3 w-16 bg-surface-2 rounded shrink-0" />
                                </div>
                                <div className="col-span-2 flex items-center">
                                    <div className="h-3 w-20 bg-surface-2 rounded shrink-0" />
                                </div>
                                <div className="col-span-2 flex items-center justify-end">
                                    <div className="h-3 w-8 bg-surface-2 rounded shrink-0" />
                                </div>
                            </div>
                        ))}
                    </div>
                ) : allItems.length === 0 && activeTab !== "playlists" ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-20 space-y-6">
                        <div className="w-24 h-24 rounded-3xl bg-surface-2 flex items-center justify-center rotate-3 hover:rotate-0 transition-transform duration-500 shadow-xl border border-border/10">
                            <VideoIcon className="w-10 h-10 text-muted-foreground/20" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-3xl font-black tracking-tighter uppercase text-foreground/90 leading-tight">
                                No {activeTab} available
                            </h3>
                            <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/40 max-w-sm mx-auto">
                                You haven't uploaded any {activeTab} yet. Start
                                sharing your creativity with the world.
                            </p>
                        </div>
                        <Button
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest text-[11px] h-12 px-10 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center gap-3"
                            onClick={() =>
                                toast.info("Upload flow coming soon!")
                            }
                        >
                            <Zap className="w-4 h-4 fill-current" /> Upload
                            video
                        </Button>
                    </div>
                ) : activeTab === "playlists" && playlists.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-20 space-y-6">
                        <div className="w-24 h-24 rounded-3xl bg-surface-2 flex items-center justify-center -rotate-3 hover:rotate-0 transition-transform duration-500 shadow-xl border border-border/10">
                            <ListVideo className="w-10 h-10 text-muted-foreground/20" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-3xl font-black tracking-tighter uppercase text-foreground/90 leading-tight">
                                No playlists yet
                            </h3>
                            <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/40 max-w-sm mx-auto">
                                Playlists are a great way to group videos
                                together for your viewers and keep them engaged.
                            </p>
                        </div>
                        <Button
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest text-[11px] h-12 px-10 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center gap-3"
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
                                <div className="grid grid-cols-12 gap-4 px-8 py-5 border-b border-border/10 bg-background sticky top-0 z-20">
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

                                {/* Table Rows */}
                                <div className="divide-y divide-border/10">
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
