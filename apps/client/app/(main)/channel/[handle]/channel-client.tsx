"use client";

import React, { useState, useMemo, useRef } from "react";
import Image from "next/image";
import { trpc } from "@/lib/trpc";
import { authClient } from "@/lib/auth/auth-client";
import { getMediaUrl, formatViewCount, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { VideoCard } from "@/components/custom/video-card";
import {
    Loader2,
    MapPin,
    Link2,
    CheckCircle,
    VideoIcon,
    Zap,
    ListVideo,
    Search,
    Play,
    Pencil,
} from "lucide-react";
import { useSubscribe } from "@/hooks/use-subscribe";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface ChannelData {
    id: string;
    handle: string | null;
    name: string | null;
    description: string | null;
    image: string | null;
    bannerUrl: string | null;
    isVerified: boolean;
    subscriberCount: number;
    videoCount: number;
    totalViews: number;
    createdAt: Date | string;
    location: string | null;
    links: any[] | null;
}

interface ChannelClientProps {
    channel: ChannelData;
    isSubscribed: boolean;
}

export function ChannelClient({
    channel,
    isSubscribed: initialSubscribed,
}: ChannelClientProps) {
    const { data: session } = authClient.useSession();
    const [activeTab, setActiveTab] = useState("videos");
    const observerRef = useRef<IntersectionObserver | null>(null);

    // -- Queries --

    // Videos Query
    const videosQuery = trpc.feed.getChannelVideos.useInfiniteQuery(
        { channelId: channel.id },
        {
            getNextPageParam: (lastPage: any) => lastPage.nextCursor,
            enabled: activeTab === "videos" || activeTab === "home",
        },
    );

    // Shorts Query
    const shortsQuery = trpc.feed.getChannelShorts.useInfiniteQuery(
        { channelId: channel.id },
        {
            getNextPageParam: (lastPage: any) => lastPage.nextCursor,
            enabled: activeTab === "shorts",
        },
    );

    // Playlists Query
    const playlistsQuery =
        trpc.playlist.getPublicChannelPlaylists.useInfiniteQuery(
            { channelId: channel.id },
            {
                getNextPageParam: (lastPage: any) => lastPage.nextCursor,
                enabled: activeTab === "playlists",
            },
        );

    const {
        isSubscribed,
        subscriberCount,
        toggleSubscribe,
        isLoading: subLoading,
    } = useSubscribe({
        channelId: channel.id,
        initialData: {
            isSubscribed: initialSubscribed,
            subscriberCount: channel.subscriberCount,
        },
    });

    const videos = videosQuery.data?.pages.flatMap((p: any) => p.videos) ?? [];
    const shorts = shortsQuery.data?.pages.flatMap((p: any) => p.videos) ?? [];
    const playlists =
        playlistsQuery.data?.pages.flatMap((p: any) => p.playlists) ?? [];

    const isOwnChannel = session?.user?.id === channel.id;

    const lastItemRef = (node: HTMLDivElement | null) => {
        const query =
            activeTab === "videos"
                ? videosQuery
                : activeTab === "shorts"
                  ? shortsQuery
                  : playlistsQuery;
        if (query.isFetchingNextPage) return;
        if (observerRef.current) observerRef.current.disconnect();
        observerRef.current = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && query.hasNextPage)
                query.fetchNextPage();
        });
        if (node) observerRef.current.observe(node);
    };

    const resolvedBannerUrl =
        getMediaUrl(channel.bannerUrl) ||
        "https://images.unsplash.com/photo-1680071523030-802bb5195a30?q=80&w=2941&auto=format&fit=crop";

    return (
        <div className="flex flex-col min-h-screen bg-background pb-20">
            {/* Banner Section */}
            <div className="relative w-full h-48 md:h-80 group">
                <Image
                    src={resolvedBannerUrl}
                    alt="Channel Banner"
                    fill
                    className="object-cover"
                    priority
                />
            </div>

            {/* Profile Section */}
            <div className="max-w-[1300px] mx-auto w-full px-6 -mt-16 md:-mt-20 relative z-10">
                <div className="flex flex-col md:flex-row gap-8 items-start">
                    {/* Avatar */}
                    <div className="shrink-0 relative">
                        <div className="w-32 h-32 md:w-44 md:h-44 rounded-full border-4 border-background bg-surface-1 shadow-2xl overflow-hidden relative ring-1 ring-border/20">
                            {channel.image ? (
                                <Image
                                    src={getMediaUrl(channel.image)}
                                    alt={channel.name || "Channel avatar"}
                                    fill
                                    className="object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-muted-foreground/20">
                                    {channel.name?.[0]?.toUpperCase()}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Basic Info */}
                    <div className="flex-1 pt-12 md:pt-24 space-y-4">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                            <div className="space-y-1">
                                <div className="flex items-center gap-3">
                                    <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase text-foreground/90 leading-none">
                                        {channel.name}
                                    </h1>
                                    {channel.isVerified && (
                                        <CheckCircle className="w-6 h-6 md:w-8 md:h-8 text-primary shadow-[0_0_20px_oklch(var(--primary)/0.4)]" />
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] md:text-[13px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 mt-4">
                                    <span className="text-foreground/80">
                                        @{channel.handle}
                                    </span>
                                    <span>
                                        {formatViewCount(subscriberCount)}{" "}
                                        subscribers
                                    </span>
                                    <span>{channel.videoCount} videos</span>
                                    <span>
                                        {formatViewCount(channel.totalViews)}{" "}
                                        views
                                    </span>
                                </div>

                                {channel.description && (
                                    <p className="text-sm text-muted-foreground line-clamp-2 max-w-2xl mt-4 leading-relaxed font-medium">
                                        {channel.description}
                                    </p>
                                )}

                                {channel.links && channel.links.length > 0 && (
                                    <div className="flex flex-wrap gap-4 mt-4">
                                        {channel.links
                                            .slice(0, 1)
                                            .map((link: any, i: number) => (
                                                <a
                                                    key={i}
                                                    href={link.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-primary hover:text-primary/70 transition-colors"
                                                >
                                                    <Link2 className="w-3.5 h-3.5" />
                                                    {link.title || "Main Link"}
                                                </a>
                                            ))}
                                        {channel.links.length > 1 && (
                                            <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/20">
                                                and {channel.links.length - 1}{" "}
                                                more links
                                            </span>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
                                {!isOwnChannel && (
                                    <Button
                                        onClick={toggleSubscribe}
                                        disabled={subLoading || !session}
                                        className={cn(
                                            "rounded-xl px-10 h-12 font-black uppercase tracking-widest text-[11px] transition-all active:scale-95 shadow-lg",
                                            isSubscribed
                                                ? "bg-surface-2 text-foreground hover:bg-surface-3 border border-border/20 shadow-sm"
                                                : "bg-foreground text-background hover:bg-foreground/90 shadow-2xl shadow-primary/20",
                                        )}
                                    >
                                        {isSubscribed
                                            ? "Subscribed"
                                            : "Subscribe"}
                                    </Button>
                                )}
                                {isOwnChannel && (
                                    <Button
                                        asChild
                                        className="bg-surface-1/60 backdrop-blur-xl border border-border/40 hover:bg-surface-2 text-foreground rounded-xl px-8 h-12 font-black uppercase tracking-widest text-[11px] transition-all shadow-sm"
                                    >
                                        <a
                                            href={`/studio/${channel.id}/settings`}
                                        >
                                            <Pencil className="w-4 h-4 mr-2" />
                                            Customize Channel
                                        </a>
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs Section */}
            <div className="max-w-[1300px] mx-auto w-full px-6 mt-12 md:mt-16">
                <div className="flex items-center gap-1 border-b border-border/40 pb-0 mb-8 sticky top-0 bg-surface-1/60 backdrop-blur-2xl z-30 overflow-x-auto no-scrollbar">
                    {[
                        { id: "videos", label: "Videos", icon: VideoIcon },
                        { id: "shorts", label: "Shorts", icon: Zap },
                        {
                            id: "playlists",
                            label: "Playlists",
                            icon: ListVideo,
                        },
                    ].map((tab: any) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-3 px-8 py-5 border-b-2 transition-all relative group shrink-0",
                                activeTab === tab.id
                                    ? "border-primary text-foreground"
                                    : "border-transparent text-muted-foreground/60 hover:text-foreground",
                            )}
                        >
                            <tab.icon
                                className={cn(
                                    "w-4 h-4 transition-all",
                                    activeTab === tab.id
                                        ? "text-primary scale-110"
                                        : "group-hover:text-foreground/80",
                                )}
                            />
                            <span className="text-[11px] font-black uppercase tracking-[0.2em]">
                                {tab.label}
                            </span>
                            {activeTab === tab.id && (
                                <div className="absolute inset-x-0 bottom-[-2px] h-0.5 bg-primary shadow-[0_0_15px_oklch(var(--primary)/0.5)]" />
                            )}
                        </button>
                    ))}
                    <div className="flex-1" />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 text-muted-foreground/60 hover:text-foreground"
                    >
                        <Search className="w-4 h-4" />
                    </Button>
                </div>

                {/* Tab Content */}
                <div className="min-h-[400px]">
                    {activeTab === "videos" && (
                        <div className="space-y-8">
                            {videosQuery.isLoading ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-10">
                                    {Array.from({ length: 8 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className="space-y-4 animate-pulse"
                                        >
                                            <div className="aspect-video bg-surface-2 rounded-2xl border border-border/10" />
                                            <div className="space-y-2">
                                                <div className="h-4 bg-surface-2 rounded-lg w-3/4" />
                                                <div className="h-3 bg-surface-2 rounded-lg w-1/2" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : videos.length === 0 ? (
                                <div className="text-center py-32 space-y-4">
                                    <div className="w-20 h-20 bg-surface-2 rounded-3xl flex items-center justify-center mx-auto border border-border/10">
                                        <VideoIcon className="w-8 h-8 text-muted-foreground/60" />
                                    </div>
                                    <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/40">
                                        This channel has no public videos yet.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-10">
                                    {videos.map((video: any, index: number) => {
                                        const isLast =
                                            index === videos.length - 1;
                                        return (
                                            <div
                                                key={video.id}
                                                ref={
                                                    isLast ? lastItemRef : null
                                                }
                                            >
                                                <VideoCard
                                                    video={video}
                                                    hideChannelInfo
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === "shorts" && (
                        <div className="space-y-8">
                            {shortsQuery.isLoading ? (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-10">
                                    {Array.from({ length: 12 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className="space-y-4 animate-pulse"
                                        >
                                            <div className="aspect-[9/16] bg-surface-2 rounded-2xl border border-border/10" />
                                            <div className="h-4 bg-surface-2 rounded-lg w-3/4" />
                                        </div>
                                    ))}
                                </div>
                            ) : shorts.length === 0 ? (
                                <div className="text-center py-32 space-y-4">
                                    <div className="w-20 h-20 bg-surface-2 rounded-3xl flex items-center justify-center mx-auto border border-border/10">
                                        <Zap className="w-8 h-8 text-muted-foreground/60" />
                                    </div>
                                    <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/40">
                                        No shorts available yet.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-10">
                                    {shorts.map((video: any, index: number) => {
                                        const isLast =
                                            index === shorts.length - 1;
                                        return (
                                            <div
                                                key={video.id}
                                                ref={
                                                    isLast ? lastItemRef : null
                                                }
                                                className="space-y-3 group cursor-pointer"
                                            >
                                                <div className="relative aspect-[9/16] bg-surface-2 rounded-2xl overflow-hidden shadow-xl border border-border/10 group-hover:border-primary/40 transition-all">
                                                    <Image
                                                        src={getMediaUrl(
                                                            video.thumbnailUrl,
                                                        )}
                                                        alt={video.title}
                                                        fill
                                                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                                                    />
                                                    <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                        <Play className="w-10 h-10 text-primary fill-primary shadow-[0_0_20px_oklch(var(--primary)/0.5)]" />
                                                    </div>
                                                    <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-[10px] font-black text-white px-2 py-1 bg-surface-1/40 backdrop-blur-md rounded-lg">
                                                        <VideoIcon className="w-3 h-3" />
                                                        {formatViewCount(
                                                            video.viewCount,
                                                        )}
                                                    </div>
                                                </div>
                                                <h3 className="text-sm font-bold line-clamp-2 leading-snug group-hover:text-primary transition-colors">
                                                    {video.title}
                                                </h3>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === "playlists" && (
                        <div className="space-y-8">
                            {playlistsQuery.isLoading ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
                                    {Array.from({ length: 6 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className="space-y-4 animate-pulse"
                                        >
                                            <div className="aspect-video bg-surface-2 rounded-2xl border border-border/10" />
                                            <div className="space-y-2">
                                                <div className="h-4 bg-surface-2 rounded-lg w-3/4" />
                                                <div className="h-3 bg-surface-2 rounded-lg w-1/4" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : playlists.length === 0 ? (
                                <div className="text-center py-32 space-y-4">
                                    <div className="w-20 h-20 bg-surface-2 rounded-3xl flex items-center justify-center mx-auto border border-border/10">
                                        <ListVideo className="w-8 h-8 text-muted-foreground/60" />
                                    </div>
                                    <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/40">
                                        No public playlists found.
                                    </p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-12">
                                    {playlists.map(
                                        (playlist: any, index: number) => {
                                            const isLast =
                                                index === playlists.length - 1;
                                            return (
                                                <div
                                                    key={playlist.id}
                                                    ref={
                                                        isLast
                                                            ? lastItemRef
                                                            : null
                                                    }
                                                    className="space-y-4 group cursor-pointer"
                                                >
                                                    <div className="relative aspect-video rounded-3xl overflow-hidden shadow-2xl border border-border/20 group-hover:border-primary/40 transition-all">
                                                        {playlist.firstVideoThumbnail ? (
                                                            <Image
                                                                src={getMediaUrl(
                                                                    playlist.firstVideoThumbnail,
                                                                )}
                                                                alt={
                                                                    playlist.title
                                                                }
                                                                fill
                                                                className="object-cover group-hover:scale-110 transition-transform duration-700"
                                                            />
                                                        ) : (
                                                            <div className="w-full h-full bg-surface-2 flex items-center justify-center text-muted-foreground/20">
                                                                <ListVideo className="w-12 h-12" />
                                                            </div>
                                                        )}
                                                        <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors" />
                                                        <div className="absolute inset-y-0 right-0 w-1/3 bg-surface-1/60 backdrop-blur-xl border-l border-border/20 flex flex-col items-center justify-center space-y-2">
                                                            <span className="text-2xl font-black text-white">
                                                                {
                                                                    playlist
                                                                        ._count
                                                                        .playlist_videos
                                                                }
                                                            </span>
                                                            <ListVideo className="w-6 h-6 text-white" />
                                                        </div>
                                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <div className="flex items-center gap-2 px-6 py-3 bg-white text-black rounded-full font-black uppercase tracking-widest text-[10px] shadow-2xl scale-90 group-hover:scale-100 transition-transform duration-300">
                                                                <Play className="w-3 h-3 fill-black" />
                                                                Play All
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <h3 className="text-lg font-black tracking-tight uppercase leading-tight group-hover:text-primary transition-colors">
                                                            {playlist.title}
                                                        </h3>
                                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                                                            View full playlist
                                                        </p>
                                                    </div>
                                                </div>
                                            );
                                        },
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {videosQuery.isFetchingNextPage && (
                        <div className="flex justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-primary shadow-[0_0_15px_oklch(var(--primary)/0.5)]" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
