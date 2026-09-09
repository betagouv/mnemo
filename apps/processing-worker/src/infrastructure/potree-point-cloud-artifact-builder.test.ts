import { access, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { PointCloudProcessor } from "@mnemo/point-cloud-processing-adapter";
import type { ObjectStorage } from "@mnemo/storage";
import { describe, expect, it, vi } from "vitest";

import { PotreePointCloudArtifactBuilder } from "./potree-point-cloud-artifact-builder";

const asset = {
  id: "asset-id",
  projectId: "project-id",
  originalFileName: "survey.laz",
  originalObjectKey: "original.laz",
  sizeBytes: 3,
};

function createStorage() {
  const objects = new Map<string, Uint8Array>();
  const deleted: string[] = [];
  const storage: ObjectStorage = {
    createUploadUrl: vi.fn(),
    createDownloadUrl: vi.fn(),
    statObject: vi.fn(),
    readObject: vi.fn(),
    readObjectStream: vi.fn(async () => ({
      async *[Symbol.asyncIterator]() {
        yield new Uint8Array([1, 2, 3]);
      },
    })),
    writeObject: vi.fn(),
    writeObjectStream: vi.fn(async ({ objectKey, body }) => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of body) chunks.push(chunk);
      objects.set(objectKey, Buffer.concat(chunks));
    }),
    deleteObject: vi.fn(async (objectKey) => {
      deleted.push(objectKey);
      objects.delete(objectKey);
    }),
  };
  return { deleted, objects, storage };
}

describe("Potree point-cloud artifact builder", () => {
  it("stages the original privately, streams all artifacts and removes temp files", async () => {
    const { objects, storage } = createStorage();
    let workspace = "";
    const processor: PointCloudProcessor = {
      process: vi.fn(async ({ sourcePath, outputDirectory }) => {
        workspace = dirname(sourcePath);
        expect([...(await readFile(sourcePath))]).toEqual([1, 2, 3]);
        await writeFile(join(outputDirectory, "metadata.json"), "{}");
        await writeFile(
          join(outputDirectory, "hierarchy.bin"),
          new Uint8Array([4]),
        );
        await writeFile(
          join(outputDirectory, "octree.bin"),
          new Uint8Array([5, 6]),
        );
        return {
          format: "potree-v2" as const,
          processor: "PotreeConverter" as const,
          processorVersion: "2.1.1",
          pointCount: 2,
          spacing: 0.5,
          files: {
            metadata: {
              path: join(outputDirectory, "metadata.json"),
              sizeBytes: 2,
            },
            hierarchy: {
              path: join(outputDirectory, "hierarchy.bin"),
              sizeBytes: 1,
            },
            octree: {
              path: join(outputDirectory, "octree.bin"),
              sizeBytes: 2,
            },
          },
        };
      }),
    };

    const result = await new PotreePointCloudArtifactBuilder(
      storage,
      processor,
    ).build(asset);

    expect(result).toMatchObject({ pointCount: 2, spacing: 0.5 });
    expect([...objects.keys()].sort()).toEqual([
      "projects/project-id/assets/asset-id/derived/potree-v2/hierarchy.bin",
      "projects/project-id/assets/asset-id/derived/potree-v2/metadata.json",
      "projects/project-id/assets/asset-id/derived/potree-v2/octree.bin",
    ]);
    await expect(access(workspace)).rejects.toThrow();
  });

  it("removes every derived key when publication fails", async () => {
    const { deleted, storage } = createStorage();
    vi.mocked(storage.writeObjectStream).mockRejectedValueOnce(
      new Error("storage unavailable"),
    );
    const processor: PointCloudProcessor = {
      process: async ({ outputDirectory }) => {
        await writeFile(join(outputDirectory, "metadata.json"), "{}");
        await writeFile(
          join(outputDirectory, "hierarchy.bin"),
          new Uint8Array([4]),
        );
        await writeFile(
          join(outputDirectory, "octree.bin"),
          new Uint8Array([5]),
        );
        return {
          format: "potree-v2" as const,
          processor: "PotreeConverter" as const,
          processorVersion: "2.1.1",
          pointCount: 1,
          spacing: 1,
          files: {
            metadata: {
              path: join(outputDirectory, "metadata.json"),
              sizeBytes: 2,
            },
            hierarchy: {
              path: join(outputDirectory, "hierarchy.bin"),
              sizeBytes: 1,
            },
            octree: { path: join(outputDirectory, "octree.bin"), sizeBytes: 1 },
          },
        };
      },
    };

    await expect(
      new PotreePointCloudArtifactBuilder(storage, processor).build(asset),
    ).rejects.toThrow("storage unavailable");
    expect(deleted).toHaveLength(3);
  });
});
