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

export interface ObjectStorage {
  createUploadUrl(input: CreateUploadUrlInput): Promise<string>;
  createDownloadUrl(input: CreateDownloadUrlInput): Promise<string>;
  statObject(objectKey: string): Promise<StoredObject | null>;
  readObject(objectKey: string): Promise<Uint8Array>;
  writeObject(input: WriteObjectInput): Promise<void>;
  deleteObject(objectKey: string): Promise<void>;
}
