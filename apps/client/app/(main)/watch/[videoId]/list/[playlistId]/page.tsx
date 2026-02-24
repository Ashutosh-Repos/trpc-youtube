import { trpcServer } from "@/lib/trpc-server";
import { WatchClient } from "../../client";
import { notFound } from "next/navigation";
import { PlaylistData } from "@/hooks/use-playlist-player";

export default async function PlaylistWatchPage({
    params,
}: {
    params: Promise<{ videoId: string; playlistId: string }>;
}) {
    const { videoId, playlistId } = await params;

    let result;
    try {
        // Fetch both in parallel on the server — eliminates two waterfalls
        result = await Promise.all([
            trpcServer.video.getPublicVideo.query({ videoId }),
            trpcServer.playlist.getPlaylistFlow.query({ playlistId }),
        ]);
    } catch {
        notFound();
    }

    const [video, playlistData] = result;

    return (
        <WatchClient
            video={video}
            playlistId={playlistId}
            initialPlaylistData={playlistData as PlaylistData}
        />
    );
}
