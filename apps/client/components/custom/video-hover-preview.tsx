"use client";

import React, { useState, useEffect, useRef } from "react";

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
            setCurrentTime(0);
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

    const { x, y } = calculatePosition();

    if (!mounted) {
        return <div className={`bg-neutral-900 ${className}`} />;
    }

    return (
        <div
            className={`relative w-full h-full overflow-hidden bg-black flex items-center justify-center group ${className}`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* Default Thumbnail */}
            {thumbnailUrl && (
                <img
                    src={thumbnailUrl}
                    alt="Video Preview"
                    crossOrigin="anonymous"
                    className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isHovered && spriteUrl ? "opacity-0" : "opacity-100"}`}
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
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <span className="text-[10px] font-black uppercase text-white tracking-widest bg-black/60 px-2 py-1 rounded">
                        No Preview
                    </span>
                </div>
            )}
        </div>
    );
}
