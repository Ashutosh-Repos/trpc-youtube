/**
 * Storage Initialization — Replaces docker-compose `createbuckets` service
 *
 * Runs once at server startup (idempotent):
 * 1. Creates the bucket if it doesn't exist
 * 2. Sets public anonymous read policy
 * 3. Configures lifecycle rules (abort stale multipart uploads)
 * 4. Configures MinIO → Redis event notifications for uploads
 *
 * Includes retry logic for Railway cold starts where MinIO
 * may not be immediately reachable.
 *
 * PREREQUISITE: MinIO must have MINIO_NOTIFY_REDIS_* env vars set
 * for event notifications to work (configured on the MinIO service itself).
 */

import {
    CreateBucketCommand,
    HeadBucketCommand,
    PutBucketPolicyCommand,
    PutBucketLifecycleConfigurationCommand,
    PutBucketNotificationConfigurationCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import config from "../config";

const minioEndpoint = `${config.minio.useSsl ? "https" : "http"}://${config.minio.endpoint}:${config.minio.port}`;

const s3Client = new S3Client({
    region: "us-east-1",
    endpoint: minioEndpoint,
    credentials: {
        accessKeyId: config.minio.accessKey,
        secretAccessKey: config.minio.secretKey,
    },
    forcePathStyle: true,
});

const BUCKET = config.minio.bucket;
const MAX_RETRIES = 10;
const RETRY_DELAY_MS = 3000;

/**
 * Wait for MinIO to become reachable.
 * Mirrors the `until (mc alias set ...)` loop in docker-compose.
 */
async function waitForMinIO(): Promise<boolean> {
    console.log(`[Storage Init] 🔗 Connecting to MinIO at: ${minioEndpoint}`);
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET }));
            return true;
        } catch (err: any) {
            if (
                err.name === "NotFound" ||
                err.name === "NoSuchBucket" ||
                err.$metadata?.httpStatusCode === 404 ||
                err.$metadata?.httpStatusCode === 403
            ) {
                // 404 = bucket doesn't exist, 403 = bucket doesn't exist (MinIO auth mode)
                // Either way, MinIO is reachable — proceed to create bucket
                return true;
            }

            console.error(
                `[Storage Init] ⏳ Waiting for MinIO... (${attempt}/${MAX_RETRIES})`,
                JSON.stringify({
                    name: err.name,
                    message: err.message,
                    code: err.code,
                    errno: err.errno,
                    syscall: err.syscall,
                    hostname: err.hostname,
                    metadata: err.$metadata,
                    stack: err.stack?.split("\n").slice(0, 3).join(" | "),
                }),
            );
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
        }
    }

    console.error(
        `[Storage Init] ❌ MinIO not reachable after ${MAX_RETRIES} attempts`,
    );
    return false;
}

/**
 * Idempotent storage initialization.
 * Safe to call on every server start.
 */
export async function initStorage(): Promise<void> {
    console.log(`[Storage Init] 🪣 Initializing storage: ${BUCKET}...`);

    // 0. Wait for MinIO to be reachable (Railway cold start)
    const isReachable = await waitForMinIO();
    if (!isReachable) return;

    // 1. Create bucket if it doesn't exist
    try {
        await s3Client.send(new HeadBucketCommand({ Bucket: BUCKET }));
        console.log(`[Storage Init] ✅ Bucket "${BUCKET}" already exists`);
    } catch (err: any) {
        if (
            err.name === "NotFound" ||
            err.$metadata?.httpStatusCode === 404 ||
            err.$metadata?.httpStatusCode === 403 ||
            err.name === "NoSuchBucket"
        ) {
            try {
                await s3Client.send(
                    new CreateBucketCommand({ Bucket: BUCKET }),
                );
                console.log(`[Storage Init] ✅ Bucket "${BUCKET}" created`);
            } catch (createErr: any) {
                if (
                    createErr.name === "BucketAlreadyOwnedByYou" ||
                    createErr.name === "BucketAlreadyExists"
                ) {
                    console.log(
                        `[Storage Init] ✅ Bucket "${BUCKET}" created by another process`,
                    );
                } else {
                    console.error(
                        `[Storage Init] ❌ Failed to create bucket:`,
                        createErr,
                    );
                    return;
                }
            }
        } else {
            console.error(`[Storage Init] ❌ Failed to check bucket:`, err);
            return;
        }
    }

    // 2. Set public anonymous read policy (equivalent to `mc anonymous set public`)
    try {
        const policy = {
            Version: "2012-10-17",
            Statement: [
                {
                    Sid: "PublicRead",
                    Effect: "Allow",
                    Principal: "*",
                    Action: ["s3:GetObject"],
                    Resource: [`arn:aws:s3:::${BUCKET}/*`],
                },
            ],
        };

        await s3Client.send(
            new PutBucketPolicyCommand({
                Bucket: BUCKET,
                Policy: JSON.stringify(policy),
            }),
        );
        console.log(`[Storage Init] ✅ Public read policy applied`);
    } catch (err) {
        console.warn(`[Storage Init] ⚠️ Failed to set bucket policy:`, err);
    }

    // 3. Lifecycle rule: abort incomplete multipart uploads after 2 days
    try {
        await s3Client.send(
            new PutBucketLifecycleConfigurationCommand({
                Bucket: BUCKET,
                LifecycleConfiguration: {
                    Rules: [
                        {
                            ID: "AbortIncompleteMultipartUploads",
                            Status: "Enabled",
                            Filter: { Prefix: "" },
                            AbortIncompleteMultipartUpload: {
                                DaysAfterInitiation: 2,
                            },
                        },
                    ],
                },
            }),
        );
        console.log(
            `[Storage Init] ✅ Lifecycle rule applied (abort stale uploads after 2 days)`,
        );
    } catch (err) {
        console.warn(`[Storage Init] ⚠️ Failed to set lifecycle rules:`, err);
    }

    // 4. Configure event notification: PUT events on raw-videos/ → Redis
    // Equivalent to: mc event add minio/youtube-videos arn:minio:sqs::primary:redis --event put --prefix raw-videos/
    // REQUIRES: MinIO started with MINIO_NOTIFY_REDIS_ENABLE_primary=on (and related env vars)
    try {
        await s3Client.send(
            new PutBucketNotificationConfigurationCommand({
                Bucket: BUCKET,
                NotificationConfiguration: {
                    QueueConfigurations: [
                        {
                            Id: "RawVideoUploadToRedis",
                            QueueArn: "arn:minio:sqs::primary:redis",
                            Events: ["s3:ObjectCreated:*"],
                            Filter: {
                                Key: {
                                    FilterRules: [
                                        {
                                            Name: "prefix",
                                            Value: "raw-videos/",
                                        },
                                    ],
                                },
                            },
                        },
                    ],
                },
            }),
        );
        console.log(
            `[Storage Init] ✅ Event notification configured (PUT raw-videos/ → Redis)`,
        );
    } catch (err) {
        // This will fail if MinIO doesn't have MINIO_NOTIFY_REDIS_* env vars set.
        // That's OK — the explicit trigger in completeUpload is the primary path.
        console.warn(
            `[Storage Init] ⚠️ Event notifications skipped (Redis target may not be configured on MinIO):`,
            err,
        );
    }

    console.log(`[Storage Init] 🎉 Storage initialization complete`);
}
