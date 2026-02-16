import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Format large numbers to human-readable format (1.2K, 3.4M, etc.)
 */
export function formatViewCount(count: number): string {
    if (count < 1000) return count.toString();
    if (count < 1_000_000)
        return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}K`;
    if (count < 1_000_000_000)
        return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    return `${(count / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
}

/**
 * Resolve relative S3 keys to full public URLs
 */
export function getMediaUrl(key: string | null | undefined) {
    if (!key) return "";
    if (key.startsWith("http")) return key;

    const baseUrl =
        process.env.NEXT_PUBLIC_PUBLIC_MINIO_URL ||
        process.env.NEXT_PUBLIC_MINIO_URL ||
        "http://localhost:9000";
    const bucket = process.env.NEXT_PUBLIC_MINIO_BUCKET || "youtube-videos";

    // Clean leading/trailing slashes
    const cleanBase = baseUrl.replace(/\/+$/, "");
    const cleanKey = key.replace(/^\/+/, "");

    // If the key already includes the bucket name, don't double count it
    // (This helps with legacy data that might have stored partial URLs)
    if (cleanKey.startsWith(`${bucket}/`)) {
        return `${cleanBase}/${cleanKey}`;
    }

    return `${cleanBase}/${bucket}/${cleanKey}`;
}

// upload file types || size limits

export const UploadTypeSchema = z.enum([
    "avatar",
    "banner",
    "channel-logo",
    "channel-banner",
    "thumbnail",
    "playlist-thumbnail",
]);

export type UploadType = z.infer<typeof UploadTypeSchema>;

export const ContentTypeSchema = z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
]);

export const MaxSizes: Record<UploadType, number> = {
    avatar: 5 * 1024 * 1024,
    banner: 10 * 1024 * 1024,
    "channel-logo": 5 * 1024 * 1024,
    "channel-banner": 10 * 1024 * 1024,
    thumbnail: 5 * 1024 * 1024,
    "playlist-thumbnail": 5 * 1024 * 1024,
};

export const AllowedMimeTypes: Record<UploadType, string[]> = {
    avatar: ["image/jpeg", "image/png", "image/webp"],
    banner: ["image/jpeg", "image/png", "image/webp"],
    "channel-logo": ["image/jpeg", "image/png", "image/webp"],
    "channel-banner": ["image/jpeg", "image/png", "image/webp"],
    thumbnail: ["image/jpeg", "image/png", "image/webp"],
    "playlist-thumbnail": ["image/jpeg", "image/png", "image/webp"],
};
