import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { toast } from "sonner";

export type VideoStatusState = {
    status: "PENDING" | "UPLOADING" | "PROCESSING" | "READY" | "FAILED" | null;
    progress: number;
};

export function useVideoStatus(videoId: string | null) {
    const [state, setState] = useState<VideoStatusState>({
        status: null,
        progress: 0,
    });

    trpc.video.onProcessingStatus.useSubscription(
        { videoId: videoId! },
        {
            enabled: !!videoId,
            onData(data) {
                setState({
                    status: data.status ?? null,
                    progress: data.progress || 0,
                });

                if (data.status === "READY") {
                    toast.success("Video processing complete!");
                } else if (data.status === "FAILED") {
                    toast.error("Video processing failed.");
                }
            },
            onError(err) {
                console.error("Subscription error:", err);
            },
        },
    );

    return state;
}
