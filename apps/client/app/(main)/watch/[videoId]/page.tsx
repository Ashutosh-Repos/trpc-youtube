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

    let video;
    try {
        video = await trpcServer.video.getPublicVideo.query({ videoId });
    } catch (error: unknown) {
        const err = error as {
            shape?: { data?: { code?: string } };
            data?: { code?: string };
        };
        const code = err?.shape?.data?.code ?? err?.data?.code;
        if (code === "UNAUTHORIZED" || code === "FORBIDDEN") {
            redirect("/login");
        }
        notFound();
    }

    return <WatchClient video={video} />;
}
