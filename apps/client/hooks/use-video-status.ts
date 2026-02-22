"use client";

import { trpc } from "@/lib/trpc";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ProcessingStatus =
    | "PENDING"
    | "UPLOADING"
    | "PROCESSING"
    | "READY"
    | "FAILED";

export interface VideoStatusState {
    /** Current processing stage */
    status: ProcessingStatus | null;

    /** 0-100 progress percentage. -1 means indeterminate. */
    progress: number;

    /** Set when video is ready */
    hlsUrl: string | null;

    /** Thumbnail options generated during processing */
    thumbnails: string[];

    /** Preview sprite (storyboard) paths */
    previewSprite: string | null;
    previewSpriteVtt: string | null;

    /** Error message when status === FAILED */
    error: string | null;

    /** True when the subscription is live */
    isLive: boolean;

    /** True once the terminal state (READY | FAILED) is reached and no more updates expected */
    isTerminal: boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

interface UseVideoStatusOptions {
    /** Initial processing status from the DB (avoids flash of empty state) */
    initialStatus?: ProcessingStatus | null;
    /** Initial HLS URL – if already READY, no subscription needed */
    initialHlsUrl?: string | null;
    /** Initial thumbnails from DB */
    initialThumbnails?: string[];
    /** Called when processing completes successfully – lets parent refresh video data */
    onReady?: (hlsUrl: string, thumbnails: string[]) => void;
}

export function useVideoStatus(
    videoId: string | null,
    {
        initialStatus,
        initialHlsUrl,
        initialThumbnails = [],
        onReady,
    }: UseVideoStatusOptions = {},
) {
    // Seed state from props (avoids blank panel on initial mount)
    const [state, setState] = useState<VideoStatusState>(() => {
        const terminal =
            initialStatus === "READY" || initialStatus === "FAILED";
        return {
            status: initialStatus ?? null,
            progress: initialStatus === "READY" ? 100 : 0,
            hlsUrl: initialHlsUrl ?? null,
            thumbnails: initialThumbnails,
            previewSprite: null,
            previewSpriteVtt: null,
            error: null,
            isLive: false,
            isTerminal: terminal,
        };
    });

    // Track whether we've already shown the toast to avoid duplicates on re-render
    const toastShownRef = useRef(false);

    const handleData = useCallback(
        (data: {
            status?: string;
            progress?: number;
            hlsUrl?: string;
            thumbnails?: string[];
            previewSprite?: string;
            previewSpriteVtt?: string;
            error?: string;
        }) => {
            const newStatus = (data.status as ProcessingStatus) ?? null;
            const isTerminal = newStatus === "READY" || newStatus === "FAILED";

            setState((prev) => ({
                ...prev,
                status: newStatus ?? prev.status,
                progress:
                    data.progress ??
                    (isTerminal && newStatus === "READY" ? 100 : prev.progress),
                hlsUrl: data.hlsUrl ?? prev.hlsUrl,
                thumbnails: data.thumbnails?.length
                    ? data.thumbnails
                    : prev.thumbnails,
                previewSprite: data.previewSprite ?? prev.previewSprite,
                previewSpriteVtt:
                    data.previewSpriteVtt ?? prev.previewSpriteVtt,
                error: data.error ?? prev.error,
                isLive: true,
                isTerminal,
            }));

            if (newStatus === "READY" && !toastShownRef.current) {
                toastShownRef.current = true;
                toast.success("Your video is ready!", {
                    description:
                        "Processing complete. Viewers can now watch your video.",
                    duration: 6000,
                });
                if (data.hlsUrl) {
                    onReady?.(data.hlsUrl, data.thumbnails ?? []);
                }
            } else if (newStatus === "FAILED" && !toastShownRef.current) {
                toastShownRef.current = true;
                toast.error("Video processing failed", {
                    description:
                        data.error ??
                        "An unknown error occurred during processing.",
                    duration: 8000,
                });
            }
        },
        [onReady],
    );

    // Only subscribe when video is actively processing (skip READY/FAILED — terminal already)
    const shouldSubscribe =
        !!videoId &&
        !state.isTerminal &&
        state.status !== "READY" &&
        state.status !== "FAILED";

    trpc.video.onProcessingStatus.useSubscription(
        { videoId: videoId! },
        {
            enabled: shouldSubscribe,
            onStarted() {
                setState((prev) => ({ ...prev, isLive: true }));
            },
            onData(data) {
                handleData(data);
            },
            onError(err) {
                console.error("[useVideoStatus] Subscription error:", err);
                setState((prev) => ({ ...prev, isLive: false }));
            },
        },
    );

    return state;
}
