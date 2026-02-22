"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";

/**
 * Inner component: isolated so its useSearchParams() call is inside <Suspense>.
 * Without <Suspense>, Next.js cannot statically render this route shell,
 * causing a full-page hydration mismatch.
 */
function PlaylistRedirect() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const list = searchParams.get("list") ?? "";

    const { data, error } = trpc.playlist.getPlaylistFlow.useQuery(
        { playlistId: list },
        { enabled: !!list, retry: false },
    );

    useEffect(() => {
        if (!data) return;
        if (data.videos.length > 0) {
            router.replace(`/watch/${data.videos[0].id}/list/${list}`);
        }
    }, [data, list, router]);

    if (!list) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
                <p>No playlist specified.</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <h1 className="text-xl font-bold">Playlist not found</h1>
                <p className="text-muted-foreground">
                    {error.message.includes("FORBIDDEN")
                        ? "This playlist is private."
                        : "This playlist doesn't exist or has been removed."}
                </p>
            </div>
        );
    }

    if (data && data.videos.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
                <h1 className="text-2xl font-bold">This playlist is empty</h1>
                <p className="text-muted-foreground">
                    Add videos to this playlist to watch them here.
                </p>
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>Loading playlist…</p>
        </div>
    );
}

export default function PlaylistPage() {
    return (
        <Suspense
            fallback={
                <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p>Loading playlist…</p>
                </div>
            }
        >
            <PlaylistRedirect />
        </Suspense>
    );
}
