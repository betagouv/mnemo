import { describe, expect, it, vi } from "vitest";
import { UntwineProgress } from "./untwine-progress";

function frame(percent: number, message = "Processing points") {
  const bytes = Buffer.alloc(12 + Buffer.byteLength(message));
  bytes.writeInt32LE(1000, 0);
  bytes.writeUInt32LE(percent, 4);
  bytes.writeUInt32LE(Buffer.byteLength(message), 8);
  bytes.write(message, 12);
  return bytes;
}

describe("Untwine progress pipe", () => {
  it("decodes split headers and messages and multiple frames in one chunk", () => {
    const report = vi.fn();
    const progress = new UntwineProgress(report);
    const bytes = Buffer.concat([frame(12), frame(41)]);
    for (const part of [
      bytes.subarray(0, 3),
      bytes.subarray(3, 10),
      bytes.subarray(10),
    ])
      progress.write(part);
    expect(report.mock.calls).toEqual([[12], [41]]);
  });
  it("ignores error messages and bounds and preserves the percentage", () => {
    const report = vi.fn();
    const onError = vi.fn();
    const progress = new UntwineProgress(report, onError);
    const error = Buffer.alloc(12);
    error.writeInt32LE(1001, 0);
    error.writeUInt32LE(4, 4);
    error.write("oops", 8);
    progress.write(Buffer.concat([error, frame(80), frame(20), frame(150)]));
    expect(report.mock.calls).toEqual([[80], [80], [100]]);
    expect(onError).toHaveBeenCalledExactlyOnceWith("oops");
  });
  it("discards invalid and oversized frames without retaining their payload", () => {
    const report = vi.fn();
    const progress = new UntwineProgress(report);
    progress.write(Buffer.alloc(8));
    const oversized = frame(20);
    oversized.writeUInt32LE(1_000_000, 8);
    progress.write(oversized);
    progress.write(frame(30));
    expect(report).toHaveBeenCalledExactlyOnceWith(30);
  });
});
