"use client";

import { format } from "date-fns";
import { cn, getMediaUrl } from "@/lib/utils";
import dynamic from "next/dynamic";

const VideoPlayer = dynamic(
    () =>
        import("@/components/custom/video-player").then(
            (mod) => mod.VideoPlayer,
        ),
    { ssr: false },
);

import { useVideoEngagement } from "@/hooks/use-video-engagement";
import type { AppRouter } from "@youtube/server/src/trpc/router";
import { inferRouterOutputs } from "@trpc/server";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ThumbsUp, ThumbsDown, Share2, MoreHorizontal } from "lucide-react";
import { useVideoReaction } from "@/hooks/use-video-reaction";
import { useSubscribe } from "@/hooks/use-subscribe";
import { SubscribeButton } from "@/components/custom/subscribe-button";
import { authClient } from "@/lib/auth/auth-client";
import Link from "next/link";
import { trpc } from "@/lib/trpc";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type VideoData = RouterOutputs["video"]["getPublicVideo"];

import { CommentSection } from "@/components/comments";
import { RecommendationFeed } from "./recommendation-feed";
import { PlaylistSidebar } from "./list/[playlistId]/playlist-sidebar";
import { usePlaylistPlayerStore } from "@/hooks/use-playlist-player";
import { PlaylistData } from "@/hooks/use-playlist-player";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SaveToPlaylistModal } from "@/components/custom/save-to-playlist-modal";

interface WatchClientProps {
    video: VideoData;
    playlistId?: string;
    initialPlaylistData?: PlaylistData;
}

export function WatchClient({
    video,
    playlistId,
    initialPlaylistData,
}: WatchClientProps) {
    const { data: session } = authClient.useSession();
    const router = useRouter();
    const playlistStore = usePlaylistPlayerStore();
    const { onPlay, onProgress } = useVideoEngagement(video.id);

    // Wrap the server-provided video with a reactive tRPC query for cache invalidations
    const { data: reactiveVideo } = trpc.video.getPublicVideo.useQuery(
        { videoId: video.id },
        {
            initialData: video,
            refetchOnMount: false,
            refetchOnReconnect: false,
            refetchOnWindowFocus: false,
        },
    );

    // Engagement Hook (Optimistic via React 19 useOptimistic + Reactive DB state)
    const { likeCount, isLiked, isDisliked, toggleLike, toggleDislike } =
        useVideoReaction({
            videoId: reactiveVideo.id,
            reactiveData: {
                likeCount: reactiveVideo.likeCount,
                dislikeCount: reactiveVideo.dislikeCount,
                liked: reactiveVideo.engagement?.liked || false,
                disliked: reactiveVideo.engagement?.disliked || false,
            },
        });

    // Subscription Hook
    const { isSubscribed, subscriberCount, toggleSubscribe, isLoading } =
        useSubscribe({
            channelId: reactiveVideo.channelId,
            reactiveData: {
                isSubscribed: reactiveVideo.engagement?.subscribed || false,
                subscriberCount: reactiveVideo.channels?.subscriberCount || 0,
            },
        });

    // Initial time from merged history
    const initialTime = video.history?.watchedSeconds || 0;

    return (
        <div className="relative flex flex-col gap-6 p-4 w-full lg:flex-row z-10">
            {/* Cinematic Aura Depth */}
            <div className="absolute inset-0 -z-10 pointer-events-none overflow-hidden">
                {/* Primary Luminous Layer */}
                <div
                    className="absolute -top-[15%] -left-[10%] w-[130%] h-[130%] opacity-15 dark:opacity-30 blur-[150px] transition-all duration-1000 scale-110"
                    style={{
                        backgroundImage: `url(${getMediaUrl(video.thumbnailUrl || "")})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                    }}
                />
                {/* Secondary Brand Aura (Violet) */}
                <div className="absolute top-[20%] right-[10%] w-[50%] h-[50%] bg-secondary-brand/20 blur-[120px] rounded-full animate-pulse-slow" />
                {/* Tertiary Emerald Shimmer */}
                <div className="absolute bottom-[20%] left-[20%] w-[40%] h-[40%] bg-tertiary/10 blur-[100px] rounded-full" />
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col gap-4">
                {/* Player Container */}
                <div className="w-full relative shadow-2xl rounded-2xl overflow-hidden bg-black aspect-video">
                    <VideoPlayer
                        videoId={video.id}
                        src={getMediaUrl(video.hlsPlaylistUrl || "")}
                        poster={getMediaUrl(video.thumbnailUrl || "")}
                        spriteVtt={getMediaUrl(video.previewSpriteVtt || "")}
                        onPlay={onPlay}
                        onProgress={onProgress}
                        initialTime={initialTime}
                        autoPlay={true}
                        onEnd={() => {
                            if (playlistId) {
                                const nextId = playlistStore.next();
                                if (nextId)
                                    router.push(
                                        `/watch/${nextId}/list/${playlistId}`,
                                    );
                            }
                        }}
                    />
                </div>

                {/* Video Title */}
                <h1 className="text-2xl font-black tracking-tight line-clamp-2 md:text-3xl mt-2 text-foreground/95">
                    {video.title}
                </h1>

                {/* Actions Bar */}
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between px-1">
                    {/* Channel Info */}
                    <div className="flex items-center gap-4">
                        <Link
                            href={`/channel/@${video.channels?.handle || video.channelId}`}
                        >
                            <Avatar className="h-12 w-12 cursor-pointer border border-border/40 ring-2 ring-transparent hover:ring-primary/40 transition-all shadow-xl bg-surface-2">
                                <AvatarImage
                                    src={getMediaUrl(video.channelImage || "")}
                                />
                                <AvatarFallback className="font-bold bg-secondary">
                                    {video.channelName?.[0]}
                                </AvatarFallback>
                            </Avatar>
                        </Link>
                        <div className="flex flex-col">
                            <Link
                                href={`/channel/@${video.channels?.handle || video.channelId}`}
                            >
                                <h3 className="text-[16px] font-bold hover:text-primary cursor-pointer transition-colors tracking-tight">
                                    {video.channelName}
                                </h3>
                            </Link>
                            <span className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/30 mt-0.5">
                                {subscriberCount} subscribers
                            </span>
                        </div>
                        {session?.user?.id !== video.channels?.userId && (
                            <SubscribeButton
                                isSubscribed={isSubscribed}
                                onClick={toggleSubscribe}
                                disabled={isLoading}
                                className="ml-4"
                            />
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 font-bold uppercase tracking-widest text-[10px]">
                        <div className="flex items-center rounded-2xl bg-surface-1/60 backdrop-blur-xl border border-border/40 shadow-sm">
                            <Button
                                variant="ghost"
                                className={`rounded-l-2xl px-5 h-10 border-r border-border/40 ${isLiked ? "text-primary bg-primary/15" : "text-muted-foreground hover:text-foreground"} hover:bg-surface-2 transition-all`}
                                onClick={toggleLike}
                            >
                                <ThumbsUp
                                    className={`h-4 w-4 mr-2 ${isLiked ? "fill-current" : ""}`}
                                />
                                {likeCount}
                            </Button>
                            <Button
                                variant="ghost"
                                className={`rounded-r-2xl px-5 h-10 ${isDisliked ? "text-secondary-brand bg-secondary-brand/15" : "text-muted-foreground hover:text-foreground"} hover:bg-surface-2 transition-all`}
                                onClick={toggleDislike}
                            >
                                <ThumbsDown
                                    className={`h-4 w-4 ${isDisliked ? "fill-current" : ""}`}
                                />
                            </Button>
                        </div>

                        <Button
                            variant="secondary"
                            className="rounded-2xl px-6 h-10 bg-surface-1/60 backdrop-blur-xl border border-border/40 hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-all shadow-sm"
                            onClick={() => {
                                const url = window.location.href;
                                if (navigator.share) {
                                    navigator
                                        .share({
                                            title: video.title,
                                            text: `Check out this video: ${video.title}`,
                                            url: url,
                                        })
                                        .catch((err) => {
                                            if (err.name !== "AbortError") {
                                                navigator.clipboard.writeText(
                                                    url,
                                                );
                                                toast.success(
                                                    "Link copied to clipboard!",
                                                );
                                            }
                                        });
                                } else {
                                    navigator.clipboard.writeText(url);
                                    toast.success("Link copied to clipboard!");
                                }
                            }}
                        >
                            <Share2 className="h-4 w-4 mr-2" />
                            Share
                        </Button>
                        <SaveToPlaylistModal videoId={video.id} />
                        <Button
                            variant="secondary"
                            size="icon"
                            className="rounded-2xl h-10 w-10 bg-surface-1/60 backdrop-blur-xl border border-border/40 hover:bg-surface-2 text-muted-foreground hover:text-foreground transition-all shadow-sm"
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                {/* Description Box */}
                <div className="bg-surface-1/60 backdrop-blur-xl border border-border/40 rounded-3xl p-5 text-[14px] whitespace-pre-wrap transition-all duration-300 cursor-default group/desc shadow-sm">
                    <div className="font-bold mb-3 flex gap-2 items-center text-[10px] tracking-[0.2em] uppercase text-muted-foreground/30">
                        <span className="text-foreground/80 font-black">
                            {video.viewCount} views
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full bg-border/40" />
                        <span className="text-foreground/80 font-black">
                            {format(new Date(video.createdAt), "PPP")}
                        </span>
                    </div>
                    <p
                        className={cn(
                            "leading-relaxed font-medium transition-colors",
                            !video.description
                                ? "text-muted-foreground italic"
                                : "text-foreground/80 group-hover/desc:text-foreground",
                        )}
                    >
                        {video.description || "No description provided."}
                    </p>
                </div>

                {/* Comment Section */}
                <div className="mt-4">
                    <CommentSection videoId={video.id} />
                </div>
            </div>

            {/* Sidebar (Recommendations & Playlist) */}
            <div className="lg:w-[420px] shrink-0 flex flex-col gap-4">
                {playlistId && (
                    <PlaylistSidebar
                        playlistId={playlistId}
                        currentVideoId={video.id}
                        initialData={initialPlaylistData}
                    />
                )}

                <div className="flex items-center justify-between px-1">
                    <h2 className="font-black text-lg tracking-tight">
                        Up Next
                    </h2>
                </div>
                <RecommendationFeed videoId={video.id} />
            </div>
        </div>
    );
}

export default WatchClient;
