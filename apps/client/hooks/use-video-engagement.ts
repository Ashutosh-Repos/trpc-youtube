import { useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "@/lib/auth/auth-client";

export function useVideoEngagement(videoId: string) {
    const { data: session } = useSession();
    const registerViewMutation = trpc.video.registerView.useMutation();
    const updateProgressMutation = trpc.video.updateWatchProgress.useMutation();

    const hasRegisteredView = useRef(false);
    const lastProgressUpdate = useRef<number>(0);

    // Reset state when videoId changes
    const previousVideoId = useRef(videoId);
    if (previousVideoId.current !== videoId) {
        hasRegisteredView.current = false;
        lastProgressUpdate.current = 0;
        previousVideoId.current = videoId;
    }

    const onPlay = useCallback(() => {
        // Fast Lane: View counting runs for everyone (IP based)
        // But if strict auth is required for views too, uncomment check:
        // if (!session) return;

        if (!hasRegisteredView.current) {
            registerViewMutation.mutate({ videoId });
            hasRegisteredView.current = true;
        }
    }, [videoId, registerViewMutation]);

    const onProgress = useCallback(
        (currentTime: number) => {
            if (!session) return; // Strict Auth: No history for guests

            const now = Date.now();
            // Update every 10 seconds (Reliable Lane)
            if (now - lastProgressUpdate.current > 10000) {
                updateProgressMutation.mutate({
                    videoId,
                    seconds: Math.floor(currentTime),
                });
                lastProgressUpdate.current = now;
            }
        },
        [videoId, updateProgressMutation, session],
    );

    return {
        onPlay,
        onProgress,
    };
}
