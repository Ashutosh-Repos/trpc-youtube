"use client";

import React, { useRef } from "react";
import Image from "next/image";
import { trpc } from "@/lib/trpc";
import { authClient } from "@/lib/auth/auth-client";
import { getMediaUrl, formatViewCount } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { VideoCard } from "@/components/custom/video-card";
import { Loader2, MapPin, Link2, CheckCircle } from "lucide-react";
import { useSubscribe } from "@/hooks/use-subscribe";

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
    links: { url: string; title: string }[] | null;
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
    const observerRef = useRef<IntersectionObserver | null>(null);

    const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
        trpc.feed.getChannelVideos.useInfiniteQuery(
            { channelId: channel.id },
            {
                getNextPageParam: (lastPage) => lastPage.nextCursor,
            },
        );

    const lastVideoRef = (node: HTMLDivElement | null) => {
        if (isFetchingNextPage) return;
        if (observerRef.current) observerRef.current.disconnect();
        observerRef.current = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && hasNextPage) fetchNextPage();
        });
        if (node) observerRef.current.observe(node);
    };

    const {
        isSubscribed,
        toggleSubscribe,
        isLoading: subLoading,
    } = useSubscribe({
        channelId: channel.id,
        initialData: {
            isSubscribed: initialSubscribed,
            subscriberCount: channel.subscriberCount,
        },
    });

    const videos =
        data?.pages.flatMap(
            (p: {
                videos: React.ComponentProps<typeof VideoCard>["video"][];
            }) => p.videos,
        ) ?? [];
    const isOwnChannel = session?.user?.id === channel.id;

    return (
        <div className="flex flex-col min-h-screen">
            {/* Banner */}
            <div className="relative w-full h-[160px] md:h-[220px] bg-linear-to-br from-primary/20 via-secondary/30 to-background overflow-hidden">
                {channel.bannerUrl && (
                    <Image
                        src={getMediaUrl(channel.bannerUrl)}
                        alt={channel.name || "Channel banner"}
                        fill
                        className="object-cover"
                        priority
                    />
                )}
            </div>

            {/* Channel Header */}
            <div className="max-w-[1300px] mx-auto w-full px-4 md:px-8">
                <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4 -mt-12 sm:-mt-10 pb-6 border-b border-border/20">
                    {/* Avatar */}
                    <div className="relative w-24 h-24 md:w-32 md:h-32 rounded-full border-4 border-background bg-secondary overflow-hidden shrink-0 shadow-xl">
                        {channel.image ? (
                            <Image
                                src={getMediaUrl(channel.image)}
                                alt={channel.name || "Channel avatar"}
                                fill
                                className="object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-4xl font-bold text-muted-foreground">
                                {channel.name?.[0]?.toUpperCase()}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 flex-1 pb-2">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <h1 className="text-3xl md:text-5xl font-black tracking-tighter">
                                    {channel.name}
                                </h1>
                                {channel.isVerified && (
                                    <CheckCircle className="w-6 h-6 text-primary shadow-[0_0_15px_oklch(var(--primary)/0.4)]" />
                                )}
                            </div>
                            <div className="text-[13px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 flex flex-row gap-4 flex-wrap mt-2">
                                <span className="text-foreground/60">
                                    @{channel.handle}
                                </span>
                                <span>
                                    {formatViewCount(channel.subscriberCount)}{" "}
                                    subscribers
                                </span>
                                <span>{channel.videoCount} videos</span>
                                <span>
                                    {formatViewCount(channel.totalViews)} views
                                </span>
                            </div>
                            {channel.location && (
                                <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-muted-foreground/30 mt-3">
                                    <MapPin className="w-3.5 h-3.5" />
                                    {channel.location}
                                </div>
                            )}
                        </div>
                        {!isOwnChannel && (
                            <Button
                                onClick={toggleSubscribe}
                                disabled={subLoading || !session}
                                className={`rounded-full px-6 shrink-0 ${isSubscribed ? "bg-secondary text-foreground hover:bg-secondary/80" : "bg-foreground text-background hover:bg-foreground/80"}`}
                            >
                                {isSubscribed ? "Subscribed" : "Subscribe"}
                            </Button>
                        )}
                    </div>
                </div>

                {/* Description */}
                {channel.description && (
                    <div className="py-4 border-b border-border/20">
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
                            {channel.description}
                        </p>
                    </div>
                )}

                {/* Links */}
                {channel.links && channel.links.length > 0 && (
                    <div className="py-3 flex flex-wrap gap-3 border-b border-border/20">
                        {channel.links.map(
                            (
                                link: { url: string; title: string },
                                i: number,
                            ) => (
                                <a
                                    key={i}
                                    href={link.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                                >
                                    <Link2 className="w-3 h-3" />
                                    {link.title}
                                </a>
                            ),
                        )}
                    </div>
                )}

                <div className="py-12">
                    <h2 className="text-xl font-black tracking-tighter uppercase mb-6 text-foreground/90">
                        Videos
                    </h2>
                    {isLoading ? (
                        <div className="flex justify-center py-16">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : videos.length === 0 ? (
                        <div className="text-center py-16 text-muted-foreground">
                            This channel has no public videos yet.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                            {videos.map(
                                (
                                    video: React.ComponentProps<
                                        typeof VideoCard
                                    >["video"] & { id: string },
                                    index: number,
                                ) => {
                                    const isLast = index === videos.length - 1;
                                    return (
                                        <div
                                            key={video.id}
                                            ref={isLast ? lastVideoRef : null}
                                        >
                                            <VideoCard video={video} />
                                        </div>
                                    );
                                },
                            )}
                        </div>
                    )}
                    {isFetchingNextPage && (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
