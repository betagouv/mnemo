import { spawn } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

const outputNames = ["metadata.json", "hierarchy.bin", "octree.bin"] as const;
const maxDiagnosticCharacters = 64 * 1_024;

type JsonObject = Record<string, unknown>;

export type PointCloudOctreeResult = {
  format: "potree-v2";
  processor: "PotreeConverter";
  processorVersion: string;
  pointCount: number;
  spacing: number;
  files: {
    metadata: { path: string; sizeBytes: number };
    hierarchy: { path: string; sizeBytes: number };
    octree: { path: string; sizeBytes: number };
  };
};

export interface PointCloudProcessor {
  process(input: {
    sourcePath: string;
    outputDirectory: string;
  }): Promise<PointCloudOctreeResult>;
}

export type PotreeConverterOptions = {
  executablePath: string;
  version?: string;
  run?: typeof runConverter;
  readMetadata?: (path: string) => Promise<string>;
  fileSize?: (path: string) => Promise<number>;
};

function asObject(value: unknown, label: string): JsonObject {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Potree ${label} must be an object`);
  }
  return value as JsonObject;
}

function finiteNonNegative(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Potree ${label} must be a non-negative safe integer`);
  }
  return value;
}

function finitePositive(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`Potree ${label} must be a finite positive number`);
  }
  return value;
}

export function parsePotreeMetadata(source: string) {
  const metadata = asObject(JSON.parse(source) as unknown, "metadata");
  const hierarchy = asObject(metadata.hierarchy, "hierarchy");
  const boundingBox = asObject(metadata.boundingBox, "boundingBox");

  if (metadata.version !== "2.0") {
    throw new Error(
      `Unsupported Potree format version: ${String(metadata.version)}`,
    );
  }
  if (metadata.encoding !== "DEFAULT") {
    throw new Error(
      `Unsupported Potree point encoding: ${String(metadata.encoding)}`,
    );
  }
  if (!Array.isArray(metadata.attributes) || metadata.attributes.length === 0) {
    throw new Error("Potree metadata must contain point attributes");
  }
  if (!Array.isArray(boundingBox.min) || !Array.isArray(boundingBox.max)) {
    throw new Error("Potree metadata must contain bounding-box coordinates");
  }

  return {
    pointCount: finiteNonNegative(metadata.points, "point count"),
    spacing: finitePositive(metadata.spacing, "spacing"),
    firstHierarchyChunkSize: finiteNonNegative(
      hierarchy.firstChunkSize,
      "first hierarchy chunk size",
    ),
  };
}

export function isPotreeConvertibleFile(fileName: string) {
  return /\.(?:las|laz)$/i.test(fileName.trim());
}

async function runConverter(
  executablePath: string,
  sourcePath: string,
  outputDirectory: string,
) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      executablePath,
      [sourcePath, "--outdir", outputDirectory, "--method", "poisson"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let diagnostics = "";
    const collect = (chunk: Buffer) => {
      if (diagnostics.length >= maxDiagnosticCharacters) return;
      diagnostics += chunk
        .toString("utf8")
        .slice(0, maxDiagnosticCharacters - diagnostics.length);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `PotreeConverter failed (${signal ? `signal ${signal}` : `code ${String(code)}`}): ${diagnostics.trim() || "no diagnostics"}`,
        ),
      );
    });
  });
}

async function fileSize(path: string) {
  const details = await stat(path);
  if (!details.isFile())
    throw new Error(`Potree output is not a file: ${path}`);
  return details.size;
}

export class PotreeConverterProcessor implements PointCloudProcessor {
  private readonly run: typeof runConverter;
  private readonly readMetadata: (path: string) => Promise<string>;
  private readonly getFileSize: (path: string) => Promise<number>;
  private readonly version: string;

  constructor(private readonly options: PotreeConverterOptions) {
    if (!isAbsolute(options.executablePath)) {
      throw new Error("PotreeConverter executable path must be absolute");
    }
    this.run = options.run ?? runConverter;
    this.readMetadata =
      options.readMetadata ?? ((path) => readFile(path, "utf8"));
    this.getFileSize = options.fileSize ?? fileSize;
    this.version = options.version ?? "2.1.1";
  }

  async process(input: { sourcePath: string; outputDirectory: string }) {
    if (!isAbsolute(input.sourcePath) || !isAbsolute(input.outputDirectory)) {
      throw new Error(
        "PotreeConverter source and output paths must be absolute",
      );
    }
    if (!isPotreeConvertibleFile(input.sourcePath)) {
      throw new Error("PotreeConverter accepts only LAS and LAZ sources");
    }

    await this.run(
      this.options.executablePath,
      input.sourcePath,
      input.outputDirectory,
    );
    const [metadataSource, metadataSize, hierarchySize, octreeSize] =
      await Promise.all([
        this.readMetadata(join(input.outputDirectory, outputNames[0])),
        this.getFileSize(join(input.outputDirectory, outputNames[0])),
        this.getFileSize(join(input.outputDirectory, outputNames[1])),
        this.getFileSize(join(input.outputDirectory, outputNames[2])),
      ]);
    const metadata = parsePotreeMetadata(metadataSource);

    return {
      format: "potree-v2" as const,
      processor: "PotreeConverter" as const,
      processorVersion: this.version,
      pointCount: metadata.pointCount,
      spacing: metadata.spacing,
      files: {
        metadata: {
          path: join(input.outputDirectory, outputNames[0]),
          sizeBytes: metadataSize,
        },
        hierarchy: {
          path: join(input.outputDirectory, outputNames[1]),
          sizeBytes: hierarchySize,
        },
        octree: {
          path: join(input.outputDirectory, outputNames[2]),
          sizeBytes: octreeSize,
        },
      },
    } satisfies PointCloudOctreeResult;
  }
}
