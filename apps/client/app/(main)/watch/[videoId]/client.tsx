"use client";

import { format } from "date-fns";
import { getMediaUrl } from "@/lib/utils";
import { VideoPlayer } from "@/components/custom/video-player";
import { useVideoEngagement } from "@/hooks/use-video-engagement";
import type { AppRouter } from "@youtube/server/src/trpc/router";
import { inferRouterOutputs } from "@trpc/server";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ThumbsUp, ThumbsDown, Share2, MoreHorizontal } from "lucide-react";
import { useVideoReaction } from "@/hooks/use-video-reaction";
import { useSubscribe } from "@/hooks/use-subscribe";
import { SubscribeButton } from "@/components/custom/subscribe-button";
import { authClient } from "@/lib/auth/auth-client";
import Link from "next/link";

type RouterOutputs = inferRouterOutputs<AppRouter>;
type VideoData = RouterOutputs["video"]["getPublicVideo"];

import { CommentSection } from "@/components/comments";
import { RecommendationFeed } from "./recommendation-feed";
import { PlaylistSidebar } from "./list/[playlistId]/playlist-sidebar";
import { usePlaylistPlayerStore } from "@/hooks/use-playlist-player";
import { PlaylistData } from "@/hooks/use-playlist-player";
import { useRouter } from "next/navigation";

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

    // Initial time from merged history
    const initialTime = video.history?.watchedSeconds || 0;

    return (
        <div className="flex flex-col gap-6 p-4 max-w-[1700px] mx-auto w-full lg:flex-row">
            {/* Main Content */}
            <div className="flex-1 flex flex-col gap-4">
                {/* Player Container */}
                <div className="w-full">
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
                <h1 className="text-xl font-bold line-clamp-2 md:text-2xl">
                    {video.title}
                </h1>

                {/* Actions Bar */}
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    {/* Channel Info */}
                    <div className="flex items-center gap-4">
                        <Link
                            href={`/@${video.channels?.handle || video.channelId}`}
                        >
                            <Avatar className="h-10 w-10 cursor-pointer">
                                <AvatarImage
                                    src={getMediaUrl(video.channelImage || "")}
                                />
                                <AvatarFallback>
                                    {video.channelName?.[0]}
                                </AvatarFallback>
                            </Avatar>
                        </Link>
                        <div className="flex flex-col">
                            <Link
                                href={`/@${video.channels?.handle || video.channelId}`}
                            >
                                <h3 className="text-sm font-semibold hover:text-white cursor-pointer">
                                    {video.channelName}
                                </h3>
                            </Link>
                            <span className="text-xs text-muted-foreground">
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
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
                        <div className="flex items-center rounded-full bg-secondary">
                            <Button
                                variant="ghost"
                                className={`rounded-l-full px-4 border-r border-neutral-700 ${isLiked ? "text-white" : "text-neutral-400"} hover:bg-neutral-800`}
                                onClick={toggleLike}
                            >
                                <ThumbsUp
                                    className={`h-4 w-4 mr-2 ${isLiked ? "fill-current" : ""}`}
                                />
                                {likeCount}
                            </Button>
                            <Button
                                variant="ghost"
                                className={`rounded-r-full px-4 ${isDisliked ? "text-white" : "text-neutral-400"} hover:bg-neutral-800`}
                                onClick={toggleDislike}
                            >
                                <ThumbsDown
                                    className={`h-4 w-4 ${isDisliked ? "fill-current" : ""}`}
                                />
                            </Button>
                        </div>

                        <Button
                            variant="secondary"
                            className="rounded-full px-4 hover:bg-neutral-800"
                        >
                            <Share2 className="h-4 w-4 mr-2" />
                            Share
                        </Button>
                        <Button
                            variant="secondary"
                            size="icon"
                            className="rounded-full hover:bg-neutral-800"
                        >
                            <MoreHorizontal className="h-4 w-4" />
                        </Button>
                    </div>
                </div>

                <Separator className="my-2" />

                {/* Description Box */}
                <div className="bg-secondary/50 rounded-xl p-4 text-sm whitespace-pre-wrap hover:bg-secondary/70 transition-colors cursor-pointer">
                    <div className="font-semibold mb-2">
                        {video.viewCount} views •{" "}
                        {format(new Date(video.createdAt), "PPP")}
                    </div>
                    <p
                        className={
                            !video.description
                                ? "text-muted-foreground italic"
                                : ""
                        }
                    >
                        {video.description || "No description provided."}
                    </p>
                </div>

                {/* Comment Section */}
                <CommentSection videoId={video.id} />
            </div>

            {/* Sidebar (Recommendations & Playlist) */}
            <div className="lg:w-[400px] shrink-0">
                {playlistId && (
                    <PlaylistSidebar
                        playlistId={playlistId}
                        currentVideoId={video.id}
                        initialData={initialPlaylistData}
                    />
                )}

                <div className="font-semibold mb-4">Up Next</div>
                <RecommendationFeed videoId={video.id} />
            </div>
        </div>
    );
}

export default WatchClient;
