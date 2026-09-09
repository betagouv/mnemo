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

export interface ObjectStorage {
  createUploadUrl(input: CreateUploadUrlInput): Promise<string>;
  createDownloadUrl(input: CreateDownloadUrlInput): Promise<string>;
  statObject(objectKey: string): Promise<StoredObject | null>;
  readObject(objectKey: string): Promise<Uint8Array>;
  deleteObject(objectKey: string): Promise<void>;
}
