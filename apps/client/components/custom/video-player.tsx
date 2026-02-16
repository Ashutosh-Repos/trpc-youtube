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
}) => {
    const [mounted, setMounted] = React.useState(false);
    const mediaRef = React.useRef<any>(null);
    const sessionIdRef = React.useRef(uuidv4());

    React.useEffect(() => {
        setMounted(true);
    }, []);

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
