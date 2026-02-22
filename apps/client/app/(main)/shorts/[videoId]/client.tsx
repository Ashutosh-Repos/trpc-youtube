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
    SheetTrigger,
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
    const videoRef = useRef<HTMLVideoElement>(null);

    // Hard layout refs for TanStack Virtual virtualization
    const desktopScrollRef = React.useRef<HTMLDivElement>(null);
    const mobileScrollRef = React.useRef<HTMLDivElement>(null);

    // Auto-close comments when navigating to a different Short
    useEffect(() => {
        setIsCommentsOpen(false);
    }, [video.id]);

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
    const { isSubscribed, subscriberCount, toggleSubscribe, isLoading } =
        useSubscribe({
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
        <div className="flex h-[calc(100vh-64px)] w-full items-center justify-center bg-[#0f0f0f] sm:bg-transparent overflow-hidden sm:py-6 gap-6 transition-all duration-300">
            <div className="relative flex h-full max-h-[850px] w-full max-w-[450px] sm:h-[90%] sm:rounded-2xl bg-black shadow-2xl overflow-hidden group">
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
                    {...({
                        crossorigin: "anonymous",
                        autoplay: isActive,
                        muted: true, // Crucial for autoplay policies on Shorts
                    } as any)}
                />

                {/* Overlays (Gradient to darken text background) */}
                <div className="absolute inset-x-0 bottom-0 top-1/2 bg-linear-to-t from-black/95 via-black/40 to-transparent pointer-events-none" />

                {/* Absolute Container spanning full height for UI */}
                <div className="absolute inset-0 flex flex-col justify-end p-4 pb-6 sm:pb-4 pointer-events-none">
                    <div className="flex gap-4 items-end pointer-events-auto">
                        {/* Video Info Container (Left Flow) */}
                        <div className="flex-1 flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                                <Link
                                    href={`/@${video.channels.handle || video.channels.id}`}
                                >
                                    <Avatar className="h-9 w-9 border border-white/20 hover:opacity-80 transition-opacity">
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
                                    href={`/@${video.channels.handle || video.channels.id}`}
                                    className="text-white font-medium text-[15px] drop-shadow-md hover:underline decoration-white/70"
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
                            <h1 className="text-white text-[15px] leading-snug drop-shadow-md line-clamp-2">
                                {video.title}
                            </h1>
                            {video.description && (
                                <p className="text-white/80 text-[13px] line-clamp-1 mb-2">
                                    {video.description}
                                </p>
                            )}
                        </div>

                        {/* Right Action Bar */}
                        <div className="flex flex-col gap-5 items-center pb-2">
                            <div
                                className="flex flex-col items-center gap-1 group/btn cursor-pointer"
                                onClick={toggleLike}
                            >
                                <button className="w-12 h-12 bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center transition-all group-hover/btn:scale-105 active:scale-95">
                                    <ThumbsUp
                                        className={`w-6 h-6 ${isLiked ? "fill-white text-white" : "text-white"}`}
                                    />
                                </button>
                                <span className="text-white text-sm font-medium drop-shadow-md">
                                    {formatViewCount(likeCount)}
                                </span>
                            </div>

                            <div
                                className="flex flex-col items-center gap-1 group/btn cursor-pointer"
                                onClick={toggleDislike}
                            >
                                <button className="w-12 h-12 bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center transition-all group-hover/btn:scale-105 active:scale-95">
                                    <ThumbsDown
                                        className={`w-6 h-6 ${isDisliked ? "fill-white text-white" : "text-white"}`}
                                    />
                                </button>
                                <span className="text-white text-sm font-medium drop-shadow-md">
                                    Dislike
                                </span>
                            </div>

                            <div
                                className="flex flex-col items-center gap-1 group/btn cursor-pointer"
                                onClick={() => setIsCommentsOpen(true)}
                            >
                                <button className="w-12 h-12 bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center transition-all group-hover/btn:scale-105 active:scale-95">
                                    <MessageSquare className="w-6 h-6 text-white fill-white" />
                                </button>
                                <span className="text-white text-sm font-medium drop-shadow-md">
                                    {formatViewCount(video.commentCount)}
                                </span>
                            </div>

                            <div className="flex flex-col items-center gap-1 group/btn cursor-pointer">
                                <button className="w-12 h-12 bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center transition-all group-hover/btn:scale-105 active:scale-95">
                                    <Share2 className="w-6 h-6 text-white fill-white" />
                                </button>
                                <span className="text-white text-sm font-medium drop-shadow-md">
                                    Share
                                </span>
                            </div>

                            <div className="flex flex-col items-center group/btn cursor-pointer mt-2">
                                <button className="w-10 h-10 bg-black/40 hover:bg-black/60 backdrop-blur-sm rounded-full flex items-center justify-center transition-colors">
                                    <MoreVertical className="w-5 h-5 text-white" />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Desktop Side Panel Comments */}
            {isDesktop && isCommentsOpen && (
                <div className="hidden lg:flex flex-col h-full max-h-[850px] w-full max-w-[450px] sm:h-[90%] bg-[#0f0f0f] sm:bg-[#212121] sm:rounded-2xl shadow-2xl shrink-0 border border-neutral-800 animate-in slide-in-from-right-8 duration-300 fade-in">
                    <div className="flex items-center justify-between p-4 border-b border-neutral-800">
                        <h2 className="text-lg font-bold">
                            Comments{" "}
                            <span className="text-muted-foreground font-normal ml-1">
                                {video.commentCount}
                            </span>
                        </h2>
                        <button
                            onClick={() => setIsCommentsOpen(false)}
                            className="p-2 hover:bg-neutral-800 rounded-full transition-colors"
                        >
                            <X className="w-5 h-5 text-neutral-400" />
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
                        className="h-[75vh] sm:max-w-[450px] sm:mx-auto sm:right-auto sm:left-1/2 sm:-translate-x-1/2 rounded-t-2xl px-0 pb-0 flex flex-col pt-4 border-none bg-[#0f0f0f] sm:bg-[#212121]"
                    >
                        <SheetHeader className="px-4 pb-2 text-left">
                            <SheetTitle className="text-lg">
                                Comments{" "}
                                <span className="text-muted-foreground font-normal ml-1">
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
