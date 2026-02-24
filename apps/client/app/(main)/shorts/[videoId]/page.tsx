import { trpcServer } from "@/lib/trpc-server";
import { ShortsFeedClient } from "./feed-client";
import { notFound } from "next/navigation";

export default async function ShortsPage({
    params,
}: {
    params: Promise<{ videoId: string }>;
}) {
    const { videoId } = await params;

    let video;
    try {
        video = await trpcServer.video.getPublicVideo.query({ videoId });
    } catch {
        notFound();
    }

    return <ShortsFeedClient initialVideo={video} />;
}
