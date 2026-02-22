import React from "react";
import Link from "next/link";
import { formatDistanceToNowStrict } from "date-fns";
import { formatViewCount, getMediaUrl } from "@/lib/utils";
import { ListVideo } from "lucide-react";

interface PlaylistSearchCardProps {
    playlist: {
        id: string;
        title: string;
        thumbnailUrl: string | null;
        videoCount: number;
        updatedAt: string;
        channels: {
            id: string;
            name: string | null;
            handle: string | null;
            image: string | null;
        } | null;
    };
}

export function PlaylistSearchCard({ playlist }: PlaylistSearchCardProps) {
    const playlistUrl = `/playlist?list=${playlist.id}`;
    const channelUrl = playlist.channels
        ? `/@${playlist.channels.handle || playlist.channels.id}`
        : "#";

    return (
        <div className="flex flex-col sm:flex-row gap-4 p-2 group bg-transparent w-full border-b border-border/10 pb-4">
            <Link
                href={playlistUrl}
                className="relative shrink-0 w-full sm:w-[360px] aspect-video rounded-xl overflow-hidden bg-neutral-900 transition-all duration-300"
            >
                {/* Thumbnail */}
                <img
                    src={
                        getMediaUrl(playlist.thumbnailUrl) ||
                        "/placeholder-playlist.jpg"
                    }
                    alt={playlist.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />

                {/* Playlist Overlay */}
                <div className="absolute right-0 top-0 bottom-0 w-[40%] bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-1 text-white opacity-95 transition-opacity">
                    <ListVideo className="w-6 h-6" />
                    <span className="text-xs font-medium">
                        {playlist.videoCount} videos
                    </span>
                </div>
            </Link>

            <div className="flex flex-col overflow-hidden leading-tight flex-1 py-1 sm:pt-2 text-center sm:text-left">
                <Link
                    href={playlistUrl}
                    className="font-normal text-lg line-clamp-2 pb-[2px] hover:text-white transition-colors"
                >
                    {playlist.title}
                </Link>

                <div className="flex items-center justify-center sm:justify-start gap-1 mt-1 text-sm text-muted-foreground">
                    {playlist.channels && (
                        <>
                            <Link
                                href={channelUrl}
                                className="hover:text-foreground transition-colors"
                            >
                                {playlist.channels.name}
                            </Link>
                        </>
                    )}
                </div>

                <div className="text-xs text-muted-foreground mt-2">
                    Updated{" "}
                    {formatDistanceToNowStrict(new Date(playlist.updatedAt))}{" "}
                    ago
                </div>

                <Link
                    href={playlistUrl}
                    className="text-xs font-semibold text-muted-foreground hover:text-white mt-4 uppercase hidden sm:block"
                >
                    View full playlist
                </Link>
            </div>
        </div>
    );
}
