import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client, BUCKET_NAME } from "@/lib/s3";

export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const key = searchParams.get("key");

    if (!key) {
        return new NextResponse("Missing key parameter", { status: 400 });
    }

    try {
        // Handle HLS Manifests (.m3u8) via Proxy & Rewrite
        if (key.endsWith(".m3u8")) {
            const command = new GetObjectCommand({
                Bucket: BUCKET_NAME,
                Key: key,
            });

            // Download the manifest from S3
            const response = await s3Client.send(command);
            const text = await response.Body?.transformToString();

            if (!text) {
                return new NextResponse("Empty manifest", { status: 404 });
            }

            // Rewrite relative paths inside the manifest.
            // For .ts chunks: Inline a fast, locally-generated Presigned S3 URL directly.
            // For .m3u8 playlists: Point back to this proxy so we can intercept and rewrite them too.
            const lines = text.split(/\r?\n/);
            const baseDir = key.split("/").slice(0, -1).join("/");

            const rewrittenLines = await Promise.all(
                lines.map(async (line) => {
                    const trimmed = line.trim();
                    // Ignore comments, empty lines, or absolute URLs
                    if (
                        !trimmed ||
                        trimmed.startsWith("#") ||
                        trimmed.startsWith("http")
                    ) {
                        return line;
                    }

                    // Reconstruct the absolute S3 key
                    const absoluteKey = baseDir
                        ? `${baseDir}/${trimmed}`
                        : trimmed;

                    // If it's a nested playlist (e.g. resolution-specific), route it back through our proxy
                    if (trimmed.endsWith(".m3u8")) {
                        return `/api/media?key=${encodeURIComponent(absoluteKey)}`;
                    }

                    // If it's a media segment (.ts, MP4, etc.), directly inline a Presigned S3 URL!
                    // This enables true O(0) bandwidth with zero redirect latency.
                    const cmd = new GetObjectCommand({
                        Bucket: BUCKET_NAME,
                        Key: absoluteKey,
                    });

                    const signedUrl = await getSignedUrl(s3Client, cmd, {
                        expiresIn: 3600, // 1 hour validity for the chunk
                    });

                    return signedUrl;
                }),
            );

            const rewrittenManifest = rewrittenLines.join("\n");

            // Return the rewritten manifest to the player
            return new NextResponse(rewrittenManifest, {
                headers: {
                    "Content-Type": "application/vnd.apple.mpegurl",
                    "Cache-Control": "no-store, max-age=0", // Prevent browser caching so expired manifests are re-fetched
                },
            });
        }

        // Handle raw files (.ts, .jpg, .mp4, etc.) via Presigned Redirect
        // This guarantees O(0) bandwidth on our server, as the browser downloads directly from S3.
        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        });

        // Generate a fast, short-lived presigned URL (1 hour)
        const signedUrl = await getSignedUrl(s3Client, command, {
            expiresIn: 3600,
        });

        // 302 Redirect the browser directly to the signed S3 URL
        return NextResponse.redirect(signedUrl);
    } catch (error) {
        console.error(`[MediaProxy] Error serving ${key}:`, error);

        const err = error as {
            name?: string;
            $metadata?: { httpStatusCode?: number };
        };
        if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
            return new NextResponse("File not found", { status: 404 });
        }

        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
