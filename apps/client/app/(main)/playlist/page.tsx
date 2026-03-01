import { redirect } from "next/navigation";
import { trpcServer } from "@/lib/trpc-server";

export default async function PlaylistPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    const params = await searchParams;
    const list = params.list as string;

    if (!list) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
                <p>No playlist specified.</p>
            </div>
        );
    }

    try {
        const data = await trpcServer.playlist.getPlaylistFlow.query({
            playlistId: list,
        });

        if (data.videos.length > 0) {
            redirect(`/watch/${data.videos[0].id}/list/${list}`);
        } else {
            return (
                <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                    <h1 className="text-2xl font-bold">
                        This playlist is empty
                    </h1>
                    <p className="text-muted-foreground">
                        Add videos to this playlist to watch them here.
                    </p>
                </div>
            );
        }
    } catch (error: any) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <h1 className="text-xl font-bold">Playlist not found</h1>
                <p className="text-muted-foreground">
                    {error?.message?.includes("FORBIDDEN")
                        ? "This playlist is private."
                        : "This playlist doesn't exist or has been removed."}
                </p>
            </div>
        );
    }
}
