import { trpcServer } from "@/lib/trpc-server";
import { PlaylistTableClient } from "../_components/playlist-table-client";

export default async function ContentPlaylistsPage(props: {
    params: Promise<{ channelId: string }>;
}) {
    const { channelId } = await props.params;

    const initialData = await trpcServer.playlist.getChannelPlaylists.query({
        channelId,
    });

    return (
        <PlaylistTableClient channelId={channelId} initialData={initialData} />
    );
}
