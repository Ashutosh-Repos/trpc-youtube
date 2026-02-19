"use client";

import React from "react";
import HlsVideo from "hls-video-element/react";
import MediaThemeSutro from "player.style/sutro/react";
import { v4 as uuidv4 } from "uuid";

interface VideoPlayerProps {
    videoId: string;
    src: string;
    poster?: string;
    spriteVtt?: string;
    autoPlay?: boolean;
    onPlay?: () => void;
    onProgress?: (time: number) => void;
    onEnd?: () => void;
    initialTime?: number;
}

/**
 * Professional Video Player using Media Chrome + Sutro Theme
 * Supports HLS playback and Sprite VTT scrub-bar previews.
 * Integrates Heartbeat pulses for view counting and watch history.
 */
export const VideoPlayer: React.FC<VideoPlayerProps> = ({
    videoId,
    src,
    poster,
    spriteVtt,
    autoPlay = false,
    onPlay,
    onProgress,
    onEnd,
    initialTime = 0,
}) => {
    const [mounted, setMounted] = React.useState(false);
    const mediaRef = React.useRef<any>(null);
    const sessionIdRef = React.useRef(uuidv4());

    React.useEffect(() => {
        setMounted(true);
    }, []);

    // Set initial time
    React.useEffect(() => {
        const media = mediaRef.current;
        if (media && initialTime > 0 && mounted) {
            // Small timeout to ensure H.js is attached or metadata loaded
            // Better: listen for 'loadedmetadata' but this is a simple attempt
            const setTime = () => {
                media.currentTime = initialTime;
            };
            if (media.readyState >= 1) {
                setTime();
            } else {
                media.addEventListener("loadedmetadata", setTime, {
                    once: true,
                });
            }
        }
    }, [mounted, initialTime]);

    // Attach event listeners
    React.useEffect(() => {
        const media = mediaRef.current;
        if (!media) return;

        const handlePlay = () => onPlay?.();
        const handleTimeUpdate = () => {
            if (media.currentTime) {
                onProgress?.(media.currentTime);
            }
        };
        const handleEnded = () => onEnd?.();

        media.addEventListener("play", handlePlay);
        media.addEventListener("timeupdate", handleTimeUpdate);
        media.addEventListener("ended", handleEnded);

        return () => {
            media.removeEventListener("play", handlePlay);
            media.removeEventListener("timeupdate", handleTimeUpdate);
            media.removeEventListener("ended", handleEnded);
        };
    }, [onPlay, onProgress, onEnd, mounted]);

    if (!mounted) {
        return (
            <div className="w-full aspect-video bg-black rounded-xl animate-pulse flex items-center justify-center text-white/20 text-xs">
                Initializing Player...
            </div>
        );
    }

    return (
        <div className="w-full aspect-video bg-black rounded-xl overflow-hidden shadow-2xl relative group">
            <MediaThemeSutro
                style={
                    {
                        width: "100%",
                        height: "100%",
                        ["--media-primary-color" as any]: "rgb(59, 130, 246)",
                    } as React.CSSProperties
                }
            >
                <HlsVideo
                    ref={mediaRef}
                    slot="media"
                    src={src}
                    poster={poster}
                    playsInline
                    {...({
                        crossorigin: "anonymous",
                        autoplay: autoPlay,
                        muted: autoPlay,
                    } as any)}
                >
                    {spriteVtt && (
                        <track
                            kind="thumbnails"
                            src={spriteVtt}
                            label="thumbnails"
                            srcLang="en"
                            default
                        />
                    )}
                </HlsVideo>
            </MediaThemeSutro>
        </div>
    );
};
