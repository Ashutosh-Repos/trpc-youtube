import { trpcServer } from "@/lib/trpc-server";
import { WatchClient } from "./client";
import { notFound, redirect } from "next/navigation";

// NOTE: getPublicVideo is a protectedProcedure.
// Unauthenticated users are redirected to /login by middleware before reaching this page.
export default async function WatchPage({
    params,
}: {
    params: Promise<{ videoId: string }>;
}) {
    const { videoId } = await params;

    try {
        const video = await trpcServer.video.getPublicVideo.query({ videoId });
        return <WatchClient video={video} />;
    } catch (e: any) {
        const code = e?.shape?.data?.code ?? e?.data?.code;
        if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
            redirect("/login");
        }
        notFound();
    }
}
