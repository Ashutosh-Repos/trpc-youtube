import { S3Client } from "@aws-sdk/client-s3";

// Initialize S3 Client for presigned URL generation
// PUBLIC_S3_URL: public URL for browser-reachable presigned URLs (Railway)
// Falls back to internal endpoint for local development
const defaultEndpoint = process.env.AWS_S3_ENDPOINT || "http://localhost:9000";

export const s3Client = new S3Client({
    region: process.env.AWS_REGION || "us-east-1",
    endpoint: process.env.PUBLIC_S3_URL || defaultEndpoint,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "minioadmin",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "minioadmin",
    },
    forcePathStyle: true,
});

export const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || "youtube-videos";
