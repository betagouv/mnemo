import "server-only";

import { S3ObjectStorage, type ObjectStorage } from "@mnemo/storage";

const globalStorage = globalThis as typeof globalThis & {
  mnemoObjectStorage?: ObjectStorage;
};

function requireStorageEnvironment(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required to access object storage`);
  }

  return value;
}

export function getRuntimeObjectStorage(): ObjectStorage {
  if (globalStorage.mnemoObjectStorage) {
    return globalStorage.mnemoObjectStorage;
  }

  const endpoint = requireStorageEnvironment("S3_ENDPOINT");
  globalStorage.mnemoObjectStorage = new S3ObjectStorage({
    endpoint,
    publicEndpoint: process.env.S3_PUBLIC_ENDPOINT ?? endpoint,
    region: requireStorageEnvironment("S3_REGION"),
    bucket: requireStorageEnvironment("S3_BUCKET"),
    accessKeyId: requireStorageEnvironment("S3_ACCESS_KEY"),
    secretAccessKey: requireStorageEnvironment("S3_SECRET_KEY"),
  });

  return globalStorage.mnemoObjectStorage;
}
