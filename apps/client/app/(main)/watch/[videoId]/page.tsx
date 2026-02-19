import { trpcServer } from "@/lib/trpc-server";
import { WatchClient } from "./client";
import { notFound } from "next/navigation";

export default async function WatchPage({
    params,
}: {
    params: Promise<{ videoId: string }>;
}) {
    const { videoId } = await params;

    try {
        const video = await trpcServer.video.getPublicVideo.query({ videoId });
        return <WatchClient video={video} />;
    } catch (e) {
        notFound();
    }
}
