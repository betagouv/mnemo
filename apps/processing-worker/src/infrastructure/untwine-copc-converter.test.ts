import { EventEmitter } from "node:events";
import { spawn } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";

import { UntwineCopcConverter } from "./untwine-copc-converter";

vi.mock("node:child_process", () => ({ spawn: vi.fn() }));

function mockProcess(code: number | null, signal: string | null = null) {
  const child = Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdio: [null, null, null, new EventEmitter()],
  });
  vi.mocked(spawn).mockImplementationOnce(() => {
    queueMicrotask(() => child.emit("close", code, signal));
    return child as unknown as ReturnType<typeof spawn>;
  });
}

describe("Untwine COPC converter", () => {
  afterEach(() => vi.clearAllMocks());

  it("uses Untwine's supported output option and a separate scratch directory", async () => {
    mockProcess(0);
    await new UntwineCopcConverter("/app/bin/untwine").convert({
      sourcePath: "/tmp/job/source.laz",
      outputPath: "/tmp/job/cloud.copc.laz",
      tempDirectory: "/tmp/job/untwine-temp",
    });

    expect(spawn).toHaveBeenCalledWith(
      "/app/bin/untwine",
      [
        "--files=/tmp/job/source.laz",
        "--output_dir=/tmp/job/cloud.copc.laz",
        "--temp_dir=/tmp/job/untwine-temp",
        "--progress_fd=3",
      ],
      { stdio: ["ignore", "pipe", "pipe", "pipe"] },
    );
  });

  it("reports an OS kill as a failed conversion", async () => {
    mockProcess(null, "SIGKILL");
    await expect(
      new UntwineCopcConverter("/app/bin/untwine").convert({
        sourcePath: "/tmp/source.laz",
        outputPath: "/tmp/output.laz",
        tempDirectory: "/tmp/scratch",
      }),
    ).rejects.toThrow("Untwine COPC conversion failed (SIGKILL)");
  });

  it("rejects a relative binary path", () => {
    expect(() => new UntwineCopcConverter("untwine")).toThrow(
      "Untwine executable path must be absolute",
    );
  });
});
