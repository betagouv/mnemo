import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { Readable } from "node:stream";

import type {
  CreateDownloadUrlInput,
  CreateUploadUrlInput,
  ObjectStorage,
  StoredObject,
  WriteObjectInput,
  WriteObjectStreamInput,
} from "./object-storage";

const multipartThresholdBytes = 64 * 1024 * 1024;
const multipartPartSizeBytes = 512 * 1024 * 1024;

export type S3ObjectStorageOptions = {
  endpoint: string;
  processingEndpoint?: string;
  publicEndpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Bound large server-side uploads without changing browser presigned PUTs. */
  multipartPartSizeBytes?: number;
  multipartQueueSize?: number;
  requestTimeoutMs?: number;
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
    ...(options.requestTimeoutMs
      ? {
          requestHandler: new NodeHttpHandler({
            connectionTimeout: 10_000,
            requestTimeout: options.requestTimeoutMs,
          }),
        }
      : {}),
  });
}

export class S3ObjectStorage implements ObjectStorage {
  private readonly internalClient: S3Client;
  private readonly processingSigningClient: S3Client;
  private readonly publicSigningClient: S3Client;

  constructor(private readonly options: S3ObjectStorageOptions) {
    this.internalClient = createClient(options.endpoint, options);
    this.processingSigningClient = createClient(
      options.processingEndpoint ?? options.endpoint,
      options,
    );
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

  createInternalDownloadUrl({
    objectKey,
    expiresInSeconds,
  }: CreateDownloadUrlInput) {
    return getSignedUrl(
      this.processingSigningClient,
      new GetObjectCommand({ Bucket: this.options.bucket, Key: objectKey }),
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

  async readObject(objectKey: string) {
    const result = await this.internalClient.send(
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: objectKey,
      }),
    );

    if (!result.Body) {
      throw new Error(`Object ${objectKey} has no response body`);
    }

    return result.Body.transformToByteArray();
  }

  async readObjectStream(
    objectKey: string,
  ): Promise<AsyncIterable<Uint8Array>> {
    const result = await this.internalClient.send(
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: objectKey,
      }),
    );
    const body = result.Body;

    if (!body || !(Symbol.asyncIterator in body)) {
      throw new Error(`Object ${objectKey} has no streaming response body`);
    }

    return {
      async *[Symbol.asyncIterator]() {
        for await (const chunk of body as AsyncIterable<unknown>) {
          if (chunk instanceof Uint8Array) {
            yield chunk;
          } else if (typeof chunk === "string") {
            yield new TextEncoder().encode(chunk);
          } else {
            throw new Error(`Object ${objectKey} returned an invalid chunk`);
          }
        }
      },
    };
  }

  async writeObject({ objectKey, contentType, body }: WriteObjectInput) {
    await this.internalClient.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: objectKey,
        Body: body,
        ContentLength: body.byteLength,
        ContentType: contentType,
      }),
    );
  }

  async writeObjectStream({
    objectKey,
    contentType,
    contentLength,
    body,
  }: WriteObjectStreamInput) {
    const stream = Readable.from(body, { objectMode: false });
    const params = {
      Bucket: this.options.bucket,
      Key: objectKey,
      Body: stream,
      ContentLength: contentLength,
      ContentType: contentType,
    };

    if (contentLength <= multipartThresholdBytes) {
      await this.internalClient.send(new PutObjectCommand(params));
      return;
    }

    await new Upload({
      client: this.internalClient,
      params,
      partSize: this.options.multipartPartSizeBytes ?? multipartPartSizeBytes,
      queueSize: this.options.multipartQueueSize ?? 4,
      leavePartsOnError: false,
    }).done();
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
