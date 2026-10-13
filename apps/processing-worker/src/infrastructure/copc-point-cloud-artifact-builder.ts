import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, open, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ObjectStorage } from "@mnemo/storage";

import type { PointCloudArtifactBuilder, PointCloudAssetForProcessing, PointCloudProcessingResult } from "../application/process-point-cloud-asset";
import { sourceExtension, stageOriginal } from "./stage-point-cloud";

const copcProbeBytes = 589;

export async function inspectCopc(path: string) {
  const file = await open(path, "r");
  try {
    const bytes = new Uint8Array(copcProbeBytes);
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead < copcProbeBytes) return null;
    const view = new DataView(bytes.buffer);
    // COPC 1.0: LAS 1.4 header followed by the `copc` info VLR.
    if (view.getUint32(0, true) !== 0x4653414c || view.getUint8(24) !== 1 ||
      view.getUint8(25) !== 4 || view.getUint16(94, true) !== 375 ||
      String.fromCharCode(...bytes.subarray(377, 381)) !== "copc" ||
      view.getUint16(393, true) !== 1 ||
      ![6, 7, 8].includes(view.getUint8(104) & 63)) return null;
    const extendedPointCount = view.getBigUint64(247, true);
    const pointCount = Number(extendedPointCount || BigInt(view.getUint32(107, true)));
    if (!Number.isSafeInteger(pointCount) || pointCount < 0) {
      throw new Error("COPC point count is invalid or exceeds JavaScript's safe integer range");
    }
    const spacing = view.getFloat64(375 + 54 + 32, true);
    if (!Number.isFinite(spacing) || spacing <= 0) {
      throw new Error("COPC info VLR has invalid spacing");
    }
    return { pointCount, spacing };
  } finally {
    await file.close();
  }
}

async function convertWithPdal(executable: string, source: string, output: string) {
  if (!executable.startsWith("/")) {
    throw new Error("PDAL executable path must be absolute");
  }
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [
      "translate", source, output,
      "--writer=writers.copc",
      "--writers.copc.forward=all",
      "--writers.copc.threads=4",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let diagnostics = "";
    const capture = (chunk: Buffer) => {
      diagnostics = `${diagnostics}${chunk.toString()}`.slice(-4_096);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`PDAL COPC conversion failed (${signal ?? code}): ${diagnostics.trim()}`));
    });
  });
}

/** S3-only conversion: local files exist solely during this one-off. */
export class CopcPointCloudArtifactBuilder implements PointCloudArtifactBuilder {
  constructor(
    private readonly storage: ObjectStorage,
    private readonly pdalPath: string,
    private readonly outputPrefix: string,
  ) {}

  async build(asset: PointCloudAssetForProcessing) {
    if (!/\.(las|laz)$/i.test(asset.originalFileName)) return null;
    const workspace = await mkdtemp(join(tmpdir(), "mnemo-copc-"));
    const sourcePath = join(workspace, `source.${sourceExtension(asset.originalFileName)}`);
    const outputPath = join(workspace, "cloud.copc.laz");
    const objectKey = `${this.outputPrefix}/cloud.copc.laz`;
    try {
      await stageOriginal(this.storage, asset, sourcePath);
      const sourceInfo = await inspectCopc(sourcePath);
      if (!sourceInfo) await convertWithPdal(this.pdalPath, sourcePath, outputPath);
      const publishedPath = sourceInfo ? sourcePath : outputPath;
      const info = sourceInfo ?? await inspectCopc(publishedPath);
      if (!info) throw new Error("Converter output is not a valid COPC file");
      const { size } = await stat(publishedPath);
      await this.storage.writeObjectStream({
        objectKey,
        contentType: "application/vnd.laszip",
        contentLength: size,
        body: createReadStream(publishedPath),
      });
      return {
        format: "copc-v1" as const,
        processor: sourceInfo ? "COPC passthrough" : "PDAL writers.copc",
        processorVersion: sourceInfo ? "1.0" : "2.x",
        copcObjectKey: objectKey,
        pointCount: info.pointCount,
        spacing: info.spacing,
      };
    } catch (error) {
      await this.storage.deleteObject(objectKey).catch(() => undefined);
      throw error;
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }

  async remove(result: PointCloudProcessingResult) {
    if (result.format === "copc-v1") {
      await this.storage.deleteObject(result.copcObjectKey).catch(() => undefined);
    }
  }
}
