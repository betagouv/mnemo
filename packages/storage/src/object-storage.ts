export type CreateUploadUrlInput = {
  objectKey: string;
  contentType: string;
  expiresInSeconds: number;
};

export type StoredObject = {
  contentLength: number;
  contentType: string | null;
  etag: string | null;
};

export interface ObjectStorage {
  createUploadUrl(input: CreateUploadUrlInput): Promise<string>;
  statObject(objectKey: string): Promise<StoredObject | null>;
  deleteObject(objectKey: string): Promise<void>;
}
