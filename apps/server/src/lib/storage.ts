import {
    S3Client,
    GetObjectCommand,
    CreateMultipartUploadCommand,
    CompleteMultipartUploadCommand,
    CompletedPart,
    UploadPartCommand,
    ListPartsCommand,
    AbortMultipartUploadCommand,
    ListObjectsV2Command,
    DeleteObjectsCommand,
    HeadObjectCommand,
} from "@aws-sdk/client-s3";

import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import * as fs from "fs";
import config from "../config";

const s3Client = new S3Client({
    region: "us-east-1", // MinIO default
    endpoint: `${config.minio.useSsl ? "https" : "http"}://${config.minio.endpoint}:${config.minio.port}`,
    credentials: {
        accessKeyId: config.minio.accessKey,
        secretAccessKey: config.minio.secretKey,
    },
    forcePathStyle: true, // Required for MinIO
});

const BUCKET_NAME = config.minio.bucket;

// --- Helpers ---

/**
 * Download file from S3 to local path with robust error handling
 */
export async function downloadFile(
    key: string,
    localPath: string,
): Promise<void> {
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
    });

    const response = await s3Client.send(command);

    if (!response.Body) {
        throw new Error(`Failed to download ${key}: Body is empty`);
    }

    const writer = fs.createWriteStream(localPath);

    if (response.Body instanceof Readable) {
        try {
            await pipeline(response.Body, writer);
        } catch (err) {
            // Cleanup partial file on error
            if (fs.existsSync(localPath)) fs.unlinkSync(localPath);
            throw err;
        }
    } else {
        // For some SDK versions/environments (like browser), Body might be a Blob or other type.
        // In Node environment with valid client config, it should be a stream.
        // Fallback or explicit error for safety.
        throw new Error(`S3 Body is not a Readable stream.`);
    }
}

export async function uploadFile(
    key: string,
    localPath: string,
    contentType: string,
): Promise<void> {
    const fileStream = fs.createReadStream(localPath);

    const upload = new Upload({
        client: s3Client,
        params: {
            Bucket: BUCKET_NAME,
            Key: key,
            Body: fileStream,
            ContentType: contentType,
        },
    });

    await upload.done();
}

/**
 * Upload buffer or stream directly
 */
export async function uploadStream(
    key: string,
    body: Buffer | Readable,
    contentType: string,
): Promise<void> {
    const upload = new Upload({
        client: s3Client,
        params: {
            Bucket: BUCKET_NAME,
            Key: key,
            Body: body,
            ContentType: contentType,
        },
    });

    await upload.done();
}

/**
 * Helper to ensure local directory exists
 */
export function ensureDir(dirPath: string) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Start a new Multipart Upload Session
 */
export async function createMultipartUpload(videoId: string): Promise<string> {
    // Ensure we use generic 'source' key for format-agnostic upload
    const key = `raw-videos/${videoId}/source`;

    const command = new CreateMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        ContentType: "application/octet-stream", // Generic binary stream
    });

    const response = await s3Client.send(command);
    if (!response.UploadId)
        throw new Error("Failed to create multipart upload");
    return response.UploadId;
}

/**
 * Get a Presigned URL for a specific Part
 */
export async function getPresignedPartUrl(
    videoId: string,
    uploadId: string,
    partNumber: number,
    contentMd5?: string,
): Promise<string> {
    const key = `raw-videos/${videoId}/source`;

    const command = new UploadPartCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
    });

    // Expire in 1 hour (plenty for a 5MB chunk)
    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

/**
 * Complete the Multipart Upload
 */
export async function completeMultipartUpload(
    videoId: string,
    uploadId: string,
    parts: CompletedPart[],
): Promise<void> {
    const key = `raw-videos/${videoId}/source`;

    // Sort parts by PartNumber (Critical for S3)
    const sortedParts = parts.sort(
        (a, b) => (a.PartNumber || 0) - (b.PartNumber || 0),
    );

    const command = new CompleteMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
            Parts: sortedParts,
        },
    });

    await s3Client.send(command);
}

/**
 * List already uploaded parts (for Resume)
 */
export async function listUploadedParts(
    videoId: string,
    uploadId: string,
): Promise<CompletedPart[]> {
    const key = `raw-videos/${videoId}/source`;

    const command = new ListPartsCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
    });

    const response = await s3Client.send(command);
    return response.Parts || [];
}

/**
 * Abort a Multipart Upload
 */
export async function abortMultipartUpload(
    videoId: string,
    uploadId: string,
): Promise<void> {
    const key = `raw-videos/${videoId}/source`;

    const command = new AbortMultipartUploadCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        UploadId: uploadId,
    });

    await s3Client.send(command);
}

/**
 * Delete all objects under a given S3 prefix
 * Used for cleaning up orphaned assets on job failure
 */
export async function deleteS3Prefix(prefix: string): Promise<number> {
    let deletedCount = 0;
    let continuationToken: string | undefined;

    console.log(`[S3] 🗑️ Deleting all objects under prefix: ${prefix}`);

    do {
        const listCommand = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: prefix,
            ContinuationToken: continuationToken,
        });

        const listResponse = await s3Client.send(listCommand);

        if (listResponse.Contents && listResponse.Contents.length > 0) {
            const deleteCommand = new DeleteObjectsCommand({
                Bucket: BUCKET_NAME,
                Delete: {
                    Objects: listResponse.Contents.map((obj) => ({
                        Key: obj.Key!,
                    })),
                    Quiet: true,
                },
            });

            await s3Client.send(deleteCommand);
            deletedCount += listResponse.Contents.length;
        }

        continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);

    console.log(`[S3] ✅ Deleted ${deletedCount} objects under ${prefix}`);
    return deletedCount;
}

/**
 * Check if an object exists in S3 (User for recovery)
 */
export async function headObject(key: string): Promise<boolean> {
    try {
        const command = new HeadObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        });
        await s3Client.send(command);
        return true;
    } catch (error: any) {
        if (
            error.name === "NotFound" ||
            error.$metadata?.httpStatusCode === 404
        ) {
            return false;
        }
        throw error;
    }
}
