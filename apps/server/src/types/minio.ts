export interface S3Identity {
    principalId: string;
}

export interface S3RequestParameters {
    principalId: string;
    region: string;
    sourceIPAddress: string;
}

export interface S3ResponseElements {
    "x-amz-request-id": string;
    "x-amz-id-2": string;
    "x-minio-deployment-id"?: string;
    "x-minio-origin-endpoint"?: string;
}

export interface S3Object {
    key: string;
    size: number;
    eTag: string;
    contentType: string;
    userMetadata: Record<string, string>;
    sequencer: string;
}

export interface S3Bucket {
    name: string;
    ownerIdentity: S3Identity;
    arn: string;
}

export interface S3Entity {
    s3SchemaVersion: string;
    configurationId: string;
    bucket: S3Bucket;
    object: S3Object;
}

export interface S3EventRecord {
    eventVersion: string;
    eventSource: string;
    awsRegion: string;
    eventTime: string;
    eventName: string;
    userIdentity: S3Identity;
    requestParameters: S3RequestParameters;
    responseElements: S3ResponseElements;
    s3: S3Entity;
    source: {
        host: string;
        port: string;
        userAgent: string;
    };
}

// Standard S3 Event Format
export interface S3EventNotification {
    Records: S3EventRecord[];
}

// MinIO 'Access' Format (Array of objects containing 'Event')
export interface MinioAccessEvent {
    Event: S3EventRecord[];
    EventTime: string;
}

export type MinioEventPayload = S3EventNotification | MinioAccessEvent[];
