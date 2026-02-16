"use server";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getUser } from "@/lib/actions/user";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import {
    AllowedMimeTypes,
    ContentTypeSchema,
    MaxSizes,
    UploadType,
    UploadTypeSchema,
} from "./utils";

export type { UploadType } from "./utils";

// Initialize S3 Client for MinIO
const s3Client = new S3Client({
    region: "us-east-1", // MinIO default
    endpoint: process.env.MINIO_ENDPOINT
        ? `${process.env.MINIO_USE_SSL === "true" ? "https" : "http"}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT || 9000}`
        : "http://localhost:9000",
    credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY || "minioadmin",
        secretAccessKey: process.env.MINIO_SECRET_KEY || "minioadmin",
    },
    forcePathStyle: true, // Required for MinIO
});

const BUCKET_NAME = process.env.MINIO_BUCKET || "youtube-videos";

// Clock Skew Fix for Dev Environments (Commented out as per user request)
// let clockOffset: number | null = null;
// async function getClockOffset() {
//     if (clockOffset !== null) return clockOffset;

//     try {
//         const endpoint = process.env.MINIO_ENDPOINT
//             ? `${process.env.MINIO_USE_SSL === "true" ? "https" : "http"}://${process.env.MINIO_ENDPOINT}:${process.env.MINIO_PORT || 9000}`
//             : "http://localhost:9000";

//         const controller = new AbortController();
//         const timeoutId = setTimeout(() => controller.abort(), 2000);

//         const response = await fetch(endpoint, {
//             method: "HEAD",
//             signal: controller.signal,
//             cache: "no-store",
//         });
//         clearTimeout(timeoutId);

//         const serverDate = response.headers.get("date");
//         if (serverDate) {
//             const serverTime = new Date(serverDate).getTime();
//             const localTime = Date.now();
//             clockOffset = serverTime - localTime;
//             if (Math.abs(clockOffset) > 60000) {
//                 console.log(
//                     `[STORAGE] Detected Clock Skew: ${clockOffset}ms. Adjusting signatures.`,
//                 );
//             }
//         } else {
//             clockOffset = 0;
//         }
//     } catch (error) {
//         clockOffset = 0;
//     }
//     return clockOffset;
// }

export async function getPresignedUrl(
    type: UploadType,
    contentType: string,
    fileSize: number,
) {
    const response = await getUser();
    if (!response.success) {
        return { success: false, error: "Unauthorized" };
    }
    const user = response.data;

    // Validate Input
    const typeResult = UploadTypeSchema.safeParse(type);
    const mimeResult = ContentTypeSchema.safeParse(contentType);

    if (!typeResult.success || !mimeResult.success) {
        return { success: false, error: "Invalid file type or format" };
    }

    if (fileSize > MaxSizes[type]) {
        return {
            success: false,
            error: `File too large. Max size for ${type} is ${MaxSizes[type] / 1024 / 1024}MB`,
        };
    }

    if (!AllowedMimeTypes[type].includes(contentType)) {
        return {
            success: false,
            error: `Unsupported content type ${contentType} for ${type}`,
        };
    }

    try {
        const ext = contentType.split("/")[1];
        const uuid = uuidv4();
        // Structure: {type}/{userId}/{uuid}.{ext}
        const key = `${type.toLowerCase()}s/${user.id}/${uuid}.${ext}`;

        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            ContentType: contentType,
            ContentLength: fileSize,
        });

        // Generate presigned URL valid for 5 minutes
        // const offset = await getClockOffset();
        // const signingDate = offset ? new Date(Date.now() + offset) : new Date();
        const url = await getSignedUrl(s3Client, command, {
            expiresIn: 300,
            // signingDate,
        });

        return {
            success: true,
            data: {
                url,
                key,
            },
        };
    } catch (error) {
        console.error(`[STORAGE] Presigned URL error for ${type}:`, error);
        return { success: false, error: "Failed to generate upload URL" };
    }
}
