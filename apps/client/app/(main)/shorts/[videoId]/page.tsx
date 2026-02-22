import { trpcServer } from "@/lib/trpc-server";
import { ShortsFeedClient } from "./feed-client";
import { notFound } from "next/navigation";

export default async function ShortsPage({
    params,
}: {
    params: Promise<{ videoId: string }>;
}) {
    const { videoId } = await params;

    try {
        const video = await trpcServer.video.getPublicVideo.query({ videoId });
        return <ShortsFeedClient initialVideo={video} />;
    } catch (e) {
        notFound();
    }
}
