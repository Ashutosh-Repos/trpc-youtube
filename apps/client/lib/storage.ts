"use server";

import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getUser } from "@/lib/actions/user";
import { v4 as uuidv4 } from "uuid";
import { s3Client, BUCKET_NAME } from "./s3";

import {
    AllowedMimeTypes,
    ContentTypeSchema,
    MaxSizes,
    UploadType,
    UploadTypeSchema,
} from "./utils";

export type { UploadType } from "./utils";

export async function getPresignedUrl(
    type: UploadType,
    contentType: string,
    fileSize: number,
) {
    const response = await getUser();
    if (!response.success) {
        return { success: false, error: "Unauthorized" };
    }
    const user = response.data as { id: string };

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
