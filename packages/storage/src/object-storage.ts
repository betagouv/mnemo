export type CreateUploadUrlInput = {
  objectKey: string;
  contentType: string;
  expiresInSeconds: number;
};

export type CreateDownloadUrlInput = {
  objectKey: string;
  expiresInSeconds: number;
};

export type StoredObject = {
  contentLength: number;
  contentType: string | null;
  etag: string | null;
};

export type WriteObjectInput = {
  objectKey: string;
  contentType: string;
  body: Uint8Array;
};

export type WriteObjectStreamInput = {
  objectKey: string;
  contentType: string;
  contentLength: number;
  body: AsyncIterable<Uint8Array>;
};

export interface ObjectStorage {
  createUploadUrl(input: CreateUploadUrlInput): Promise<string>;
  createDownloadUrl(input: CreateDownloadUrlInput): Promise<string>;
  /** Signed against the endpoint reachable by server-side processing services. */
  createInternalDownloadUrl(input: CreateDownloadUrlInput): Promise<string>;
  statObject(objectKey: string): Promise<StoredObject | null>;
  readObject(objectKey: string): Promise<Uint8Array>;
  readObjectStream(objectKey: string): Promise<AsyncIterable<Uint8Array>>;
  writeObject(input: WriteObjectInput): Promise<void>;
  writeObjectStream(input: WriteObjectStreamInput): Promise<void>;
  deleteObject(objectKey: string): Promise<void>;
}
