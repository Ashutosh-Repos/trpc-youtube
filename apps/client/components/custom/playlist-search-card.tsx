import Link from "next/link";
import Image from "next/image";
import { formatDistanceToNowStrict } from "date-fns";
import { getMediaUrl } from "@/lib/utils";
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
                prefetch={false}
                href={playlistUrl}
                className="relative shrink-0 w-full sm:w-[360px] aspect-video rounded-2xl overflow-hidden bg-surface-2 border border-border/10 transition-all duration-500 group-hover:shadow-[0_20px_50px_-15px_oklch(var(--primary)/0.2)]"
            >
                <Image
                    src={
                        getMediaUrl(playlist.thumbnailUrl) ||
                        "/placeholder-playlist.jpg"
                    }
                    alt={playlist.title}
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                    }}
                />

                {/* Playlist Overlay */}
                <div className="absolute right-0 top-0 bottom-0 w-[40%] bg-surface-3/90 backdrop-blur-md flex flex-col items-center justify-center gap-1 text-foreground border-l border-border/20 shadow-[-10px_0_30px_-10px_rgba(0,0,0,0.5)] transition-all">
                    <ListVideo className="w-8 h-8 text-primary drop-shadow-[0_0_8px_oklch(var(--primary)/0.4)]" />
                    <span className="text-[11px] font-black uppercase tracking-widest text-foreground/90">
                        {playlist.videoCount} videos
                    </span>
                </div>
            </Link>

            <div className="flex flex-col overflow-hidden leading-tight flex-1 py-1 sm:pt-2 text-center sm:text-left">
                <Link
                    prefetch={false}
                    href={playlistUrl}
                    className="font-black text-xl tracking-tighter line-clamp-2 pb-[2px] group-hover:text-primary transition-colors"
                >
                    {playlist.title}
                </Link>

                <div className="flex items-center justify-center sm:justify-start gap-2 mt-1">
                    {playlist.channels && (
                        <Link
                            prefetch={false}
                            href={channelUrl}
                            className="text-[13px] font-bold uppercase tracking-widest text-muted-foreground/60 hover:text-primary transition-colors"
                        >
                            {playlist.channels.name}
                        </Link>
                    )}
                </div>

                <div className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/30 mt-3 flex items-center justify-center sm:justify-start gap-2">
                    <span className="w-1 h-1 rounded-full bg-border/40" />
                    Updated{" "}
                    {formatDistanceToNowStrict(
                        new Date(playlist.updatedAt),
                    )}{" "}
                    ago
                </div>

                <Link
                    prefetch={false}
                    href={playlistUrl}
                    className="text-xs font-semibold text-muted-foreground hover:text-white mt-4 uppercase hidden sm:block"
                >
                    View full playlist
                </Link>
            </div>
        </div>
    );
}
