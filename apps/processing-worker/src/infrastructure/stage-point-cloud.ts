import { open } from "node:fs/promises";

import type { ObjectStorage } from "@mnemo/storage";

import type { PointCloudAssetForProcessing } from "../application/process-point-cloud-asset";

export function sourceExtension(fileName: string) {
  return fileName.toLowerCase().endsWith(".laz") ? "laz" : "las";
}

export async function stageOriginal(
  storage: ObjectStorage,
  asset: PointCloudAssetForProcessing,
  path: string,
) {
  const source = await storage.readObjectStream(asset.originalObjectKey);
  const destination = await open(path, "wx", 0o600);
  let bytesWritten = 0;
  try {
    for await (const chunk of source) {
      let offset = 0;
      while (offset < chunk.byteLength) {
        const written = await destination.write(
          chunk,
          offset,
          chunk.byteLength - offset,
          null,
        );
        if (written.bytesWritten <= 0) {
          throw new Error("Point-cloud staging stopped before the original ended");
        }
        offset += written.bytesWritten;
      }
      bytesWritten += chunk.byteLength;
      if (bytesWritten > asset.sizeBytes) {
        throw new Error("Point-cloud original exceeds its declared size");
      }
    }
  } finally {
    await destination.close();
  }
  if (bytesWritten !== asset.sizeBytes) {
    throw new Error("Point-cloud original changed during staging");
  }
}
