import { trpcServer } from "@/lib/trpc-server";
import { VideoEditor } from "./_components/video-editor";
import { notFound, redirect } from "next/navigation";

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
            <div className="flex h-screen w-full flex-col items-center justify-center gap-4">
                <h1 className="text-2xl font-bold text-destructive">
                    Error Loading Video
                </h1>
                <pre className="max-w-lg overflow-auto rounded bg-muted p-4 text-sm">
                    {JSON.stringify(error, null, 2)}
                </pre>
                <p className="text-muted-foreground">
                    Check server logs for more details.
                </p>
            </div>
        );
    }

    if (video.channelId !== channelId) {
        // Mismatch between URL channelId and video owner
        redirect(`/studio/${video.channelId}/content/video/${videoId}`);
    }

    return (
        <div className="min-h-screen bg-background pb-20">
            <VideoEditor video={video} channelId={channelId} />
        </div>
    );
}
