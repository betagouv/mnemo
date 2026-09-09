import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import type {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  ObjectStorage,
  StoredObject,
} from "./object-storage";

export type S3ObjectStorageOptions = {
  endpoint: string;
  publicEndpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
};

function createClient(endpoint: string, options: S3ObjectStorageOptions) {
  return new S3Client({
    endpoint,
    region: options.region,
    forcePathStyle: true,
    credentials: {
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
    },
  });
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly internalClient: S3Client;
  private readonly publicSigningClient: S3Client;

  constructor(private readonly options: S3ObjectStorageOptions) {
    this.internalClient = createClient(options.endpoint, options);
    this.publicSigningClient = createClient(options.publicEndpoint, options);
  }

  createUploadUrl({
    objectKey,
    contentType,
    expiresInSeconds,
  }: CreateUploadUrlInput) {
    return getSignedUrl(
      this.publicSigningClient,
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: objectKey,
        ContentType: contentType,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  createDownloadUrl({ objectKey, expiresInSeconds }: CreateDownloadUrlInput) {
    return getSignedUrl(
      this.publicSigningClient,
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: objectKey,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async statObject(objectKey: string): Promise<StoredObject | null> {
    try {
      const result = await this.internalClient.send(
        new HeadObjectCommand({
          Bucket: this.options.bucket,
          Key: objectKey,
        }),
      );

      return {
        contentLength: result.ContentLength ?? 0,
        contentType: result.ContentType ?? null,
        etag: result.ETag ?? null,
      };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "NotFound" || error.name === "NoSuchKey")
      ) {
        return null;
      }

      throw error;
    }
  }

  async deleteObject(objectKey: string) {
    await this.internalClient.send(
      new DeleteObjectCommand({
        Bucket: this.options.bucket,
        Key: objectKey,
      }),
    );
  }
}
