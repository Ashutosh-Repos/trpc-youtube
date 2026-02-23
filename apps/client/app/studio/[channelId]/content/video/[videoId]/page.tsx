import { trpcServer } from "@/lib/trpc-server";
import { VideoEditor } from "./_components/video-editor";
import { notFound, redirect } from "next/navigation";
import { XCircle } from "lucide-react";

export default async function VideoDetailsPage(props: {
    params: Promise<{
        channelId: string;
        videoId: string;
    }>;
}) {
    const params = await props.params;
    const { videoId, channelId } = params;

    // Use TRPC Caller to fetch data server-side
    // This pre-hydrates the data for the client component
    // If the user doesn't own the video, TRPC will throw (handled by error boundary or catch)

    let video;
    try {
        video = await trpcServer.video.getVideo.query({ videoId });
    } catch (error) {
        // If error is NOT_FOUND or FORBIDDEN, handle appropriately
        // For simplicity, we can redirect to content or show 404
        console.error("Failed to fetch video details:", error);
        return (
            <div className="flex h-screen w-full flex-col items-center justify-center gap-6 text-center p-8 bg-surface-1">
                <div className="p-4 rounded-full bg-destructive/10 text-destructive mb-2">
                    <XCircle className="w-12 h-12" />
                </div>
                <h1 className="text-4xl font-black tracking-tighter uppercase text-foreground/90 leading-tight">
                    Error Loading Video
                </h1>
                <p className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/40 max-w-sm">
                    Something went wrong while fetching the video details.
                    Please try again later.
                </p>
                <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest text-destructive mb-3 opacity-60">
                        Error Details
                    </p>
                    <pre className="text-xs font-mono text-destructive/80 overflow-auto max-h-40 scrollbar-hide">
                        {JSON.stringify(error, null, 2)}
                    </pre>
                </div>
            </div>
        );
    }

    if (video.channelId !== channelId) {
        // Mismatch between URL channelId and video owner
        redirect(`/studio/${video.channelId}/content/video/${videoId}`);
    }

    return (
        <div className="min-h-screen bg-surface-1 pb-20">
            <VideoEditor video={video} channelId={channelId} />
        </div>
    );
}
