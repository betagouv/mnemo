import { access, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { ObjectStorage } from "@mnemo/storage";
import { describe, expect, it, vi } from "vitest";

import { CopcPointCloudArtifactBuilder } from "./copc-point-cloud-artifact-builder";
import type { CopcConverter } from "./untwine-copc-converter";

const asset = {
  id: "asset-id",
  projectId: "project-id",
  originalFileName: "survey.laz",
  originalObjectKey: "original.laz",
  sizeBytes: 3,
};

function copcHeader() {
  const bytes = Buffer.alloc(589);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  bytes.write("LASF", 0);
  bytes[24] = 1;
  bytes[25] = 4;
  view.setUint16(94, 375, true);
  bytes[104] = 7;
  view.setBigUint64(247, 3n, true);
  bytes.write("copc", 377);
  view.setUint16(393, 1, true);
  view.setFloat64(461, 0.25, true);
  return bytes;
}

function createStorage(source = new Uint8Array([1, 2, 3])) {
  const objects = new Map<string, Buffer>();
  const storage: ObjectStorage = {
    createUploadUrl: vi.fn(),
    createDownloadUrl: vi.fn(),
    createInternalDownloadUrl: vi.fn(),
    statObject: vi.fn(),
    readObject: vi.fn(),
    readObjectStream: vi.fn(async () => ({
      async *[Symbol.asyncIterator]() {
        yield source;
      },
    })),
    writeObject: vi.fn(),
    writeObjectStream: vi.fn(async ({ objectKey, body }) => {
      const chunks: Uint8Array[] = [];
      for await (const chunk of body) chunks.push(chunk);
      objects.set(objectKey, Buffer.concat(chunks));
    }),
    deleteObject: vi.fn(async (objectKey) => {
      objects.delete(objectKey);
    }),
  };
  return { objects, storage };
}

describe("COPC point-cloud artifact builder", () => {
  it("converts to one COPC object and cleans the temporary workspace", async () => {
    const { objects, storage } = createStorage();
    let workspace = "";
    const converter: CopcConverter = {
      convert: vi.fn(async ({ sourcePath, outputPath, tempDirectory }) => {
        workspace = dirname(sourcePath);
        expect(tempDirectory).toBe(join(workspace, "untwine-temp"));
        await writeFile(outputPath, copcHeader());
      }),
    };

    const result = await new CopcPointCloudArtifactBuilder(
      storage,
      converter,
      "projects/project-id/assets/asset-id/derived/copc-v1",
    ).build(asset);

    expect(result).toMatchObject({
      format: "copc-v1",
      processor: "Untwine",
      pointCount: 3,
      spacing: 0.25,
    });
    expect([...objects.keys()]).toEqual([
      "projects/project-id/assets/asset-id/derived/copc-v1/cloud.copc.laz",
    ]);
    await expect(access(workspace)).rejects.toThrow();
  });

  it("publishes an existing COPC without converting it again", async () => {
    const source = copcHeader();
    const { storage } = createStorage(source);
    const converter: CopcConverter = { convert: vi.fn() };
    const result = await new CopcPointCloudArtifactBuilder(
      storage,
      converter,
      "derived/copc-v1",
    ).build({ ...asset, sizeBytes: source.byteLength });

    expect(result).toMatchObject({ processor: "COPC passthrough" });
    expect(converter.convert).not.toHaveBeenCalled();
  });

  it("removes a partially published object when upload fails", async () => {
    const { storage } = createStorage();
    vi.mocked(storage.writeObjectStream).mockRejectedValueOnce(
      new Error("S3 unavailable"),
    );
    const converter: CopcConverter = {
      convert: async ({ outputPath }) => writeFile(outputPath, copcHeader()),
    };
    await expect(
      new CopcPointCloudArtifactBuilder(
        storage,
        converter,
        "derived/copc-v1",
      ).build(asset),
    ).rejects.toThrow("S3 unavailable");
    expect(storage.deleteObject).toHaveBeenCalledWith(
      "derived/copc-v1/cloud.copc.laz",
    );
  });
});
