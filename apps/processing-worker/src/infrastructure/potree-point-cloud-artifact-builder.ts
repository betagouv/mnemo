import { createReadStream } from "node:fs";
import { mkdir, mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import {
  buildPointCloudArtifactObjectKey,
  type ObjectStorage,
} from "@mnemo/storage";

import type {
  PointCloudArtifactBuilder,
  PointCloudAssetForProcessing,
} from "../application/process-point-cloud-asset";
import {
  isPotreeConvertibleFile,
  type PointCloudProcessor,
} from "./potree-converter";

const outputFiles = {
  metadata: { name: "metadata.json", contentType: "application/json" },
  hierarchy: {
    name: "hierarchy.bin",
    contentType: "application/octet-stream",
  },
  octree: { name: "octree.bin", contentType: "application/octet-stream" },
} as const;

function sourceExtension(fileName: string) {
  return fileName.toLowerCase().endsWith(".laz") ? "laz" : "las";
}

async function stageOriginal(
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
          throw new Error(
            "Point-cloud staging stopped before the original ended",
          );
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

export class PotreePointCloudArtifactBuilder implements PointCloudArtifactBuilder {
  constructor(
    private readonly storage: ObjectStorage,
    private readonly processor: PointCloudProcessor,
    private readonly outputPrefix?: string,
  ) {}

  async build(asset: PointCloudAssetForProcessing) {
    if (!isPotreeConvertibleFile(asset.originalFileName)) return null;

    const workspace = await mkdtemp(join(tmpdir(), "mnemo-point-cloud-"));
    const sourcePath = join(
      workspace,
      `source.${sourceExtension(asset.originalFileName)}`,
    );
    const outputDirectory = join(workspace, "potree-v2");
    const keyFor = (
      name: (typeof outputFiles)[keyof typeof outputFiles]["name"],
    ) =>
      this.outputPrefix
        ? `${this.outputPrefix}/${name}`
        : buildPointCloudArtifactObjectKey({
            projectId: asset.projectId,
            assetId: asset.id,
            name,
          });
    const keys = {
      metadata: keyFor("metadata.json"),
      hierarchy: keyFor("hierarchy.bin"),
      octree: keyFor("octree.bin"),
    };

    try {
      await mkdir(outputDirectory, { mode: 0o700 });
      await stageOriginal(this.storage, asset, sourcePath);
      const converted = await this.processor.process({
        sourcePath,
        outputDirectory,
      });

      const publications = await Promise.allSettled(
        (Object.keys(outputFiles) as Array<keyof typeof outputFiles>).map(
          async (kind) => {
            const file = converted.files[kind];
            if (basename(file.path) !== outputFiles[kind].name) {
              throw new Error(`Unexpected Potree ${kind} artifact path`);
            }
            await this.storage.writeObjectStream({
              objectKey: keys[kind],
              contentType: outputFiles[kind].contentType,
              contentLength: file.sizeBytes,
              body: createReadStream(file.path),
            });
          },
        ),
      );
      const failure = publications.find(
        (publication): publication is PromiseRejectedResult =>
          publication.status === "rejected",
      );
      if (failure) throw failure.reason;

      return {
        format: converted.format,
        processor: converted.processor,
        processorVersion: converted.processorVersion,
        metadataObjectKey: keys.metadata,
        hierarchyObjectKey: keys.hierarchy,
        octreeObjectKey: keys.octree,
        pointCount: converted.pointCount,
        spacing: converted.spacing,
      };
    } catch (error) {
      await Promise.all(
        Object.values(keys).map((key) =>
          this.storage.deleteObject(key).catch(() => undefined),
        ),
      );
      throw error;
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }

  async remove(result: {
    metadataObjectKey: string;
    hierarchyObjectKey: string;
    octreeObjectKey: string;
  }) {
    await Promise.all(
      [
        result.metadataObjectKey,
        result.hierarchyObjectKey,
        result.octreeObjectKey,
      ].map((key) => this.storage.deleteObject(key).catch(() => undefined)),
    );
  }
}
