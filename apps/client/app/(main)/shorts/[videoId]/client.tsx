"use client";

import React, { useState, useEffect, useRef } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "@youtube/server/src/trpc/router";
import { getMediaUrl } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    ThumbsUp,
    ThumbsDown,
    MessageSquare,
    Share2,
    MoreVertical,
    X,
} from "lucide-react";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { CommentSection } from "@/components/comments";
import HlsVideo from "hls-video-element/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatViewCount } from "@/lib/utils";
import { useVideoReaction } from "@/hooks/use-video-reaction";
import { useSubscribe } from "@/hooks/use-subscribe";
import { authClient } from "@/lib/auth/auth-client";
import { SubscribeButton } from "@/components/custom/subscribe-button";
import { useVideoEngagement } from "@/hooks/use-video-engagement";
import { useMediaQuery } from "@/hooks/use-media-query";

type VideoData = inferRouterOutputs<AppRouter>["video"]["getPublicVideo"];

interface ShortsClientProps {
    video: VideoData;
    isActive?: boolean;
}

export function ShortsClient({ video, isActive = true }: ShortsClientProps) {
    const { data: session } = authClient.useSession();

    // UI State
    const [isCommentsOpen, setIsCommentsOpen] = useState(false);
    const isDesktop = useMediaQuery("(min-width: 1024px)");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const videoRef = useRef<any>(null);

    // Hard layout refs for TanStack Virtual virtualization
    const desktopScrollRef = React.useRef<HTMLDivElement>(null);
    const mobileScrollRef = React.useRef<HTMLDivElement>(null);

    const [prevVideoId, setPrevVideoId] = useState(video.id);
    if (video.id !== prevVideoId) {
        setPrevVideoId(video.id);
        setIsCommentsOpen(false);
    }

    // Play/Pause sync based on viewport visibility
    useEffect(() => {
        if (!videoRef.current) return;
        if (isActive) {
            videoRef.current.play().catch(() => {});
        } else {
            videoRef.current.pause();
        }
    }, [isActive]);

    // Engagement Hook (Optimistic)
    const { likeCount, isLiked, isDisliked, toggleLike, toggleDislike } =
        useVideoReaction({
            videoId: video.id,
            initialData: {
                likeCount: video.likeCount,
                dislikeCount: video.dislikeCount,
                liked: video.engagement?.liked || false,
                disliked: video.engagement?.disliked || false,
            },
        });

    // Subscription Hook (Optimistic)
    const { isSubscribed, toggleSubscribe, isLoading } = useSubscribe({
        channelId: video.channelId,
        initialData: {
            isSubscribed: video.engagement?.subscribed || false,
            subscriberCount: video.channels?.subscriberCount || 0,
        },
    });

    const { onPlay, onProgress } = useVideoEngagement(video.id);

    // Shorts are typically played from a single combined source.
    // Video is returned as an HLS stream (m3u8) from the backend transcoder.
    const videoUrl = getMediaUrl(video.hlsPlaylistUrl || "") || "";
    const posterUrl = getMediaUrl(video.thumbnailUrl || "") || "";

    return (
        <div className="flex h-[calc(100vh-64px)] w-full items-center justify-center bg-background sm:bg-transparent overflow-hidden sm:py-6 gap-6 transition-all duration-300">
            <div className="relative flex h-full max-h-[850px] w-full max-w-[450px] sm:h-[90%] sm:rounded-3xl bg-surface-1 shadow-2xl overflow-hidden group border border-border/10">
                {/* Video Player */}
                <HlsVideo
                    ref={videoRef}
                    src={videoUrl}
                    poster={posterUrl}
                    className="h-full w-full object-cover"
                    loop
                    playsInline
                    onPlay={onPlay}
                    onTimeUpdate={(
                        e: React.SyntheticEvent<HTMLVideoElement, Event>,
                    ) => onProgress((e.target as HTMLVideoElement).currentTime)}
                    crossOrigin="anonymous"
                    // @ts-expect-error - React uses autoPlay but type complains
                    autoPlay={isActive}
                    muted={true}
                />

                {/* Overlays (Gradient to darken text background) */}
                <div className="absolute inset-x-0 bottom-0 top-1/2 bg-linear-to-t from-background/95 via-background/40 to-transparent pointer-events-none" />

                {/* Absolute Container spanning full height for UI */}
                <div className="absolute inset-0 flex flex-col justify-end p-4 pb-6 sm:pb-4 pointer-events-none">
                    <div className="flex gap-4 items-end pointer-events-auto">
                        {/* Video Info Container (Left Flow) */}
                        <div className="flex-1 flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                                <Link
                                    href={`/channel/@${video.channels.handle || video.channels.id}`}
                                >
                                    <Avatar className="h-10 w-10 border border-border/20 shadow-xl ring-2 ring-transparent hover:ring-primary/40 transition-all bg-surface-2">
                                        <AvatarImage
                                            src={
                                                getMediaUrl(
                                                    video.channels.image,
                                                ) || ""
                                            }
                                        />
                                        <AvatarFallback>
                                            {video.channels.name?.charAt(0) ||
                                                "C"}
                                        </AvatarFallback>
                                    </Avatar>
                                </Link>
                                <Link
                                    href={`/channel/@${video.channels.handle || video.channels.id}`}
                                    className="text-foreground font-black text-[15px] tracking-tight drop-shadow-md hover:text-primary transition-colors"
                                >
                                    @
                                    {video.channels.handle ||
                                        video.channels.name}
                                </Link>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="h-8 rounded-full px-4 ml-1 font-semibold hover:bg-white hover:text-black hidden"
                                >
                                    Subscribe
                                </Button>
                                {session?.user?.id !== video.channelId && (
                                    <SubscribeButton
                                        isSubscribed={isSubscribed}
                                        onClick={toggleSubscribe}
                                        disabled={isLoading}
                                        className="h-8 rounded-full px-4 ml-1 font-semibold"
                                    />
                                )}
                            </div>
                            <h1 className="text-foreground text-[16px] font-black leading-tight tracking-tight drop-shadow-md line-clamp-2">
                                {video.title}
                            </h1>
                            {video.description && (
                                <p className="text-foreground/70 text-[13px] font-medium line-clamp-1 mb-2 tracking-tight">
                                    {video.description}
                                </p>
                            )}
                        </div>

                        {/* Right Action Bar */}
                        <div className="flex flex-col gap-5 items-center pb-2">
                            <div
                                className="flex flex-col items-center gap-1.5 group/btn cursor-pointer"
                                onClick={toggleLike}
                            >
                                <button className="w-12 h-12 bg-surface-1/60 hover:bg-surface-2/80 backdrop-blur-xl border border-border/20 rounded-full flex items-center justify-center shadow-2xl transition-all group-hover/btn:scale-110 active:scale-90 group-hover/btn:shadow-primary/20">
                                    <ThumbsUp
                                        className={`w-5 h-5 ${isLiked ? "fill-primary text-primary" : "text-foreground"}`}
                                    />
                                </button>
                                <span className="text-foreground text-[11px] font-black uppercase tracking-widest drop-shadow-sm opacity-80">
                                    {formatViewCount(likeCount)}
                                </span>
                            </div>

                            <div
                                className="flex flex-col items-center gap-1.5 group/btn cursor-pointer"
                                onClick={toggleDislike}
                            >
                                <button className="w-12 h-12 bg-surface-1/60 hover:bg-surface-2/80 backdrop-blur-xl border border-border/20 rounded-full flex items-center justify-center shadow-2xl transition-all group-hover/btn:scale-110 active:scale-90 group-hover/btn:shadow-secondary-brand/20">
                                    <ThumbsDown
                                        className={`w-5 h-5 ${isDisliked ? "fill-secondary-brand text-secondary-brand" : "text-foreground"}`}
                                    />
                                </button>
                                <span className="text-foreground text-[11px] font-black uppercase tracking-widest drop-shadow-sm opacity-80">
                                    Dislike
                                </span>
                            </div>

                            <div
                                className="flex flex-col items-center gap-1.5 group/btn cursor-pointer"
                                onClick={() => setIsCommentsOpen(true)}
                            >
                                <button className="w-12 h-12 bg-surface-1/60 hover:bg-surface-2/80 backdrop-blur-xl border border-border/20 rounded-full flex items-center justify-center shadow-2xl transition-all group-hover/btn:scale-110 active:scale-90">
                                    <MessageSquare className="w-5 h-5 text-foreground fill-foreground/10" />
                                </button>
                                <span className="text-foreground text-[11px] font-black uppercase tracking-widest drop-shadow-sm opacity-80">
                                    {formatViewCount(video.commentCount)}
                                </span>
                            </div>

                            <div className="flex flex-col items-center gap-1.5 group/btn cursor-pointer">
                                <button className="w-12 h-12 bg-surface-1/60 hover:bg-surface-2/80 backdrop-blur-xl border border-border/20 rounded-full flex items-center justify-center shadow-2xl transition-all group-hover/btn:scale-110 active:scale-90">
                                    <Share2 className="w-5 h-5 text-foreground" />
                                </button>
                                <span className="text-foreground text-[11px] font-black uppercase tracking-widest drop-shadow-sm opacity-80">
                                    Share
                                </span>
                            </div>

                            <div className="flex flex-col items-center group/btn cursor-pointer mt-2">
                                <button className="w-10 h-10 bg-surface-1/40 hover:bg-surface-2/60 backdrop-blur-md rounded-full flex items-center justify-center border border-border/10 transition-all active:scale-90">
                                    <MoreVertical className="w-5 h-5 text-muted-foreground/60 hover:text-foreground" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Desktop Side Panel Comments */}
            {isDesktop && isCommentsOpen && (
                <div className="hidden lg:flex flex-col h-full max-h-[850px] w-full max-w-[450px] sm:h-[90%] bg-surface-1 sm:rounded-3xl shadow-2xl shrink-0 border border-border/20 animate-in slide-in-from-right-8 duration-500 fade-in">
                    <div className="flex items-center justify-between p-5 border-b border-border/10">
                        <h2 className="text-lg font-black tracking-tight uppercase">
                            Comments{" "}
                            <span className="text-muted-foreground/40 font-black text-sm ml-1 tracking-widest">
                                {video.commentCount}
                            </span>
                        </h2>
                        <button
                            onClick={() => setIsCommentsOpen(false)}
                            className="p-2 hover:bg-surface-2 rounded-full transition-all active:scale-90"
                        >
                            <X className="w-5 h-5 text-muted-foreground/60" />
                        </button>
                    </div>
                    <div
                        ref={desktopScrollRef}
                        className="flex-1 overflow-y-auto px-4 pb-8 hide-scrollbar"
                    >
                        <React.Suspense
                            fallback={
                                <div className="p-4 text-center">
                                    Loading...
                                </div>
                            }
                        >
                            <CommentSection
                                videoId={video.id}
                                scrollRef={desktopScrollRef}
                            />
                        </React.Suspense>
                    </div>
                </div>
            )}

            {/* Mobile Sheet Comments */}
            {!isDesktop && (
                <Sheet open={isCommentsOpen} onOpenChange={setIsCommentsOpen}>
                    <SheetContent
                        side="bottom"
                        className="h-[75vh] sm:max-w-[450px] sm:mx-auto sm:right-auto sm:left-1/2 sm:-translate-x-1/2 rounded-t-3xl px-0 pb-0 flex flex-col pt-4 border-none bg-background sm:bg-surface-1 shadow-2xl"
                    >
                        <SheetHeader className="px-6 pb-4 text-left border-b border-border/10">
                            <SheetTitle className="text-lg font-black tracking-tight uppercase">
                                Comments{" "}
                                <span className="text-muted-foreground/40 font-black text-sm ml-1 tracking-widest">
                                    {video.commentCount}
                                </span>
                            </SheetTitle>
                        </SheetHeader>
                        <div
                            ref={mobileScrollRef}
                            className="flex-1 overflow-y-auto px-4 pb-8 hide-scrollbar"
                        >
                            <React.Suspense
                                fallback={
                                    <div className="p-4 text-center">
                                        Loading...
                                    </div>
                                }
                            >
                                <CommentSection
                                    videoId={video.id}
                                    scrollRef={mobileScrollRef}
                                />
                            </React.Suspense>
                        </div>
                    </SheetContent>
                </Sheet>
            )}
        </div>
    );
}
