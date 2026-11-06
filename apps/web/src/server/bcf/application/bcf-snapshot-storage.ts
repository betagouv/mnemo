import { type ObjectStorage } from "@mnemo/storage";
import type { StoredBcfViewpoint } from "./bcf-topic-repository";

export async function readSnapshotForExport(
  storage: ObjectStorage,
  viewpoint: StoredBcfViewpoint,
): Promise<{
  bytes: Uint8Array;
  mediaType: "image/png" | "image/jpeg";
} | null> {
  if (
    !viewpoint.snapshotObjectKey ||
    !viewpoint.snapshotUploadedAt ||
    (viewpoint.snapshotMediaType !== "image/png" &&
      viewpoint.snapshotMediaType !== "image/jpeg")
  ) {
    return null;
  }

  try {
    return {
      bytes: await storage.readObject(viewpoint.snapshotObjectKey),
      mediaType: viewpoint.snapshotMediaType,
    };
  } catch {
    return null;
  }
}

export async function deleteSnapshotsBestEffort(
  storage: ObjectStorage,
  objectKeys: string[],
) {
  await Promise.allSettled(
    objectKeys.map((objectKey) => storage.deleteObject(objectKey)),
  );
}
