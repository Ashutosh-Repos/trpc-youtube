"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState, useDeferredValue, useEffect } from "react";
import { Search, Filter, X, VideoIcon, Zap, ListVideo } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface ContentTabsNavigationProps {
    channelId: string;
    isPlaylistsActive?: boolean;
    onUploadClick: () => void;
    onCreatePlaylistClick: () => void;
}

export function ContentTabsNavigation({
    channelId,
    isPlaylistsActive,
    onUploadClick,
    onCreatePlaylistClick,
}: ContentTabsNavigationProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // Derived State
    const currentSearch = searchParams.get("search") || "";
    const currentVisibility = searchParams.get("visibility") || undefined;
    const currentAgeFilter = searchParams.get("isAgeRestricted");
    const currentSortOrder = searchParams.get("sortOrder") || "newest";

    const [searchInput, setSearchInput] = useState(currentSearch);

    // Sync input with actual searchParam (e.g. if cleared from elsewhere or deep linked)
    useEffect(() => {
        setSearchInput(currentSearch);
    }, [currentSearch]);

    // Update URL when search changes, with a 400ms debounce
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (searchInput !== currentSearch) {
                updateURLParams({ search: searchInput || null });
            }
        }, 400);

        return () => clearTimeout(timeoutId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchInput]);

    const createTabHref = (tab: "videos" | "shorts" | "playlists") => {
        const newParams = new URLSearchParams(searchParams.toString());
        return `/studio/${channelId}/content/${tab}?${newParams.toString()}`;
    };

    const updateURLParams = useCallback(
        (params: Record<string, string | null>) => {
            const current = new URLSearchParams(
                Array.from(searchParams.entries()),
            );

            Object.entries(params).forEach(([key, value]) => {
                if (value === null || value === undefined) {
                    current.delete(key);
                } else {
                    current.set(key, value);
                }
            });

            // Ensure we keep the user on the same exact pathname, just changing params
            const query = current.toString();
            // Use replace instead of push to avoid cluttering history state with every keystroke
            router.replace(`${pathname}${query ? `?${query}` : ""}`, {
                scroll: false,
            });
        },
        [pathname, router, searchParams],
    );

    const isVideosActive = pathname.endsWith("/videos");
    const isShortsActive = pathname.endsWith("/shorts");
    // const isPlaylistsActive = pathname.endsWith("/playlists"); // passed down via prop if needed

    return (
        <div className="p-8 border-b border-border/10 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-black tracking-tighter uppercase text-foreground/90">
                        Channel content
                    </h1>
                    <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/40 mt-1">
                        Manage your channel&apos;s videos, shorts, and
                        playlists.
                    </p>
                </div>
                <Button
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase tracking-widest text-[11px] h-10 px-8 rounded-xl shadow-lg shadow-primary/20 transition-all active:scale-95"
                    onClick={() => {
                        if (isPlaylistsActive) {
                            onCreatePlaylistClick();
                        } else {
                            onUploadClick();
                        }
                    }}
                >
                    Create
                </Button>
            </div>

            <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
                <div className="flex bg-surface-1 border border-border/10 p-1.5 rounded-2xl shadow-inner">
                    <Link
                        href={createTabHref("videos")}
                        prefetch={true}
                        replace={true}
                        className={cn(
                            "px-6 py-2.5 rounded-xl transition-all gap-2 font-black uppercase tracking-widest text-[10px] flex items-center shadow-sm",
                            isVideosActive
                                ? "bg-surface-2 text-foreground ring-1 ring-border/10"
                                : "text-muted-foreground/40 hover:text-foreground",
                        )}
                    >
                        <VideoIcon className="w-3.5 h-3.5" /> Videos
                    </Link>
                    <Link
                        href={createTabHref("shorts")}
                        prefetch={true}
                        replace={true}
                        className={cn(
                            "px-6 py-2.5 rounded-xl transition-all gap-2 font-black uppercase tracking-widest text-[10px] flex items-center shadow-sm",
                            isShortsActive
                                ? "bg-surface-2 text-foreground ring-1 ring-border/10"
                                : "text-muted-foreground/40 hover:text-foreground",
                        )}
                    >
                        <Zap className="w-3.5 h-3.5" /> Shorts
                    </Link>

                    <Link
                        href={createTabHref("playlists")}
                        prefetch={true}
                        replace={true}
                        className={cn(
                            "px-6 py-2.5 rounded-xl transition-all gap-2 font-black uppercase tracking-widest text-[10px] flex items-center shadow-sm",
                            isPlaylistsActive
                                ? "bg-surface-2 text-foreground ring-1 ring-border/10"
                                : "text-muted-foreground/40 hover:text-foreground",
                        )}
                    >
                        <ListVideo className="w-3.5 h-3.5" /> Playlists
                    </Link>
                </div>

                {!isPlaylistsActive && (
                    <div className="flex items-center gap-2 w-full md:w-auto">
                        <div className="relative group flex-1 md:w-72">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 transition-colors text-muted-foreground/30 group-focus-within:text-primary" />
                            <Input
                                placeholder="Filter content..."
                                className="pl-10 bg-surface-1 border-border/10 focus-visible:ring-primary/20 transition-all h-10 text-[11px] font-black uppercase tracking-widest rounded-xl"
                                value={searchInput}
                                onChange={(e) => setSearchInput(e.target.value)}
                            />
                            {searchInput && (
                                <button
                                    onClick={() => setSearchInput("")}
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
                                        (currentVisibility ||
                                            currentAgeFilter !== null ||
                                            currentSortOrder !== "newest") &&
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
                                            value={currentVisibility || "all"}
                                            onValueChange={(v) =>
                                                updateURLParams({
                                                    visibility:
                                                        v === "all" ? null : v,
                                                })
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
                                                <SelectItem
                                                    value="SCHEDULED"
                                                    className="focus:bg-primary/10 focus:text-primary rounded-lg"
                                                >
                                                    {" "}
                                                    Scheduled{" "}
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
                                                currentAgeFilter === null
                                                    ? "all"
                                                    : currentAgeFilter
                                            }
                                            onValueChange={(v) =>
                                                updateURLParams({
                                                    isAgeRestricted:
                                                        v === "all" ? null : v,
                                                })
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
                                            value={currentSortOrder}
                                            onValueChange={(v) =>
                                                updateURLParams({
                                                    sortOrder:
                                                        v === "newest"
                                                            ? null
                                                            : v,
                                                })
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
                                            updateURLParams({
                                                visibility: null,
                                                isAgeRestricted: null,
                                                sortOrder: null,
                                            });
                                        }}
                                    >
                                        RESET FILTERS
                                    </Button>
                                </div>
                            </PopoverContent>
                        </Popover>
                    </div>
                )}
            </div>
        </div>
    );
}
