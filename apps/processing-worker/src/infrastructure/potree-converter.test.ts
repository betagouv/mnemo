import { describe, expect, it, vi } from "vitest";

import {
  PotreeConverterProcessor,
  isPotreeConvertibleFile,
  parsePotreeMetadata,
} from "./potree-converter";

const metadata = JSON.stringify({
  version: "2.0",
  encoding: "DEFAULT",
  points: 12_345,
  spacing: 0.25,
  hierarchy: { firstChunkSize: 66, stepSize: 4, depth: 2 },
  boundingBox: { min: [0, 0, 0], max: [10, 10, 10] },
  attributes: [{ name: "position", size: 12 }],
});

describe("PotreeConverterProcessor", () => {
  it("validates the stable Potree 2 output and reports artifact sizes", async () => {
    const run = vi.fn(async () => undefined);
    const processor = new PotreeConverterProcessor({
      executablePath: "/usr/local/bin/PotreeConverter",
      run,
      readMetadata: async () => metadata,
      fileSize: async (path) =>
        path.endsWith("metadata.json")
          ? 400
          : path.endsWith("hierarchy.bin")
            ? 66
            : 9_000,
    });

    await expect(
      processor.process({
        sourcePath: "/tmp/input.laz",
        outputDirectory: "/tmp/output",
      }),
    ).resolves.toMatchObject({
      format: "potree-v2",
      pointCount: 12_345,
      spacing: 0.25,
      files: {
        hierarchy: { sizeBytes: 66 },
        octree: { sizeBytes: 9_000 },
      },
    });
    expect(run).toHaveBeenCalledWith(
      "/usr/local/bin/PotreeConverter",
      "/tmp/input.laz",
      "/tmp/output",
    );
  });
});

describe("Potree metadata", () => {
  it("rejects encodings the native Mnemo loader cannot decode", () => {
    expect(() =>
      parsePotreeMetadata(metadata.replace("DEFAULT", "BROTLI")),
    ).toThrow("Unsupported Potree point encoding");
  });

  it("limits conversion to LAS and LAZ", () => {
    expect(isPotreeConvertibleFile("survey.LAZ")).toBe(true);
    expect(isPotreeConvertibleFile("survey.las")).toBe(true);
    expect(isPotreeConvertibleFile("survey.e57")).toBe(false);
  });
});
