"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { getMediaUrl } from "@/lib/utils";

interface VideoHoverPreviewProps {
    thumbnailUrl?: string | null;
    spriteUrl?: string | null; // Direct JPG URL
    duration?: number | null;
    className?: string;
}

/**
 * Video Hover Preview Component
 * Displays a static thumbnail by default.
 * On hover, it cycles through sprite frames using direct background-position manipulation.
 * Robust against VTT relative path issues and CORS/Signature failures.
 */
export function VideoHoverPreview({
    thumbnailUrl,
    spriteUrl,
    duration = 0,
    className = "",
}: VideoHoverPreviewProps) {
    const [isHovered, setIsHovered] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setMounted(true);
    }, []);

    // Cycle through time when hovered
    useEffect(() => {
        if (isHovered && mounted && spriteUrl && duration && duration > 0) {
            // Snappier cycle: 100ms per frame, or enough to cover duration in 5s
            const frameRate = 100; // ms
            const step = duration / 50; // Map duration to 50 steps

            intervalRef.current = setInterval(() => {
                setCurrentTime((prev) => {
                    const next = prev + step;
                    if (next >= duration) {
                        return 0; // Loop back to start
                    }
                    return next;
                });
            }, frameRate);
        } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
            // Removed setCurrentTime(0) from here to avoid cascading render warning.
            // It's reset in calculation logic below.
        }

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isHovered, spriteUrl, duration, mounted]);

    // Calculate Grid Position (10x10)
    const calculatePosition = () => {
        if (!duration || duration <= 0) return { x: 0, y: 0 };

        // Match Transcoder logic:
        // interval = Math.max(1, Math.ceil(duration / 100))
        // totalFrames = Math.ceil(duration / interval)
        const interval = Math.max(1, Math.ceil(duration / 100));
        const totalFrames = Math.ceil(duration / interval);

        // Map current time to frame index
        const frameIndex = Math.floor(currentTime / interval);
        const clampedIndex = Math.min(totalFrames - 1, Math.max(0, frameIndex));

        const col = clampedIndex % 10;
        const row = Math.floor(clampedIndex / 10);

        // background-position %: (index * 100) / (items - 1)
        const x = col * (100 / 9);
        const y = row * (100 / 9);

        return { x, y };
    };

    const { x, y } = isHovered ? calculatePosition() : { x: 0, y: 0 };

    if (!mounted) {
        return <div className={`bg-surface-1 rounded-2xl ${className}`} />;
    }

    return (
        <div
            className={`relative w-full h-full overflow-hidden bg-background rounded-2xl flex items-center justify-center group border border-border/10 ${className}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Default Thumbnail */}
            {thumbnailUrl && (
                <Image
                    src={getMediaUrl(thumbnailUrl)}
                    alt="Video Preview"
                    fill
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isHovered && spriteUrl ? "opacity-0" : "opacity-100"}`}
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
            )}

            {/* Sprite Preview (Direct CSS implementation) */}
            {spriteUrl && (
                <div
                    className={`absolute inset-0 w-full h-full transition-opacity duration-300 ${isHovered ? "opacity-100" : "opacity-0 pointer-events-none"}`}
                    style={{
                        backgroundImage: `url(${spriteUrl})`,
                        backgroundSize: "1000% 1000%", // 10x10 grid
                        backgroundPosition: `${x}% ${y}%`,
                        backgroundRepeat: "no-repeat",
                    }}
                />
            )}

            {/* Overlay status if no preview available */}
            {isHovered && (!spriteUrl || !duration || duration <= 0) && (
                <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center">
                    <span className="text-[10px] font-black uppercase text-foreground tracking-[0.2em] bg-surface-3/90 border border-border/20 px-3 py-1.5 rounded-lg shadow-2xl">
                        No Preview
                    </span>
                </div>
            )}
        </div>
    );
}
