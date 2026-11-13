import { afterEach, describe, expect, it, vi } from "vitest";
import type { ObjectStorage } from "@mnemo/storage";
import { RemotePointCloudProgress } from "./remote-point-cloud-progress";
import { createProcessRemotePointCloudAssetHandler } from "./process-remote-point-cloud-asset";
import {
  remotePointCloudOutcomeKey,
  remotePointCloudPrefix,
  remotePointCloudProgressKey,
} from "./remote-point-cloud-protocol";
import { runRemotePointCloudJob } from "./run-remote-point-cloud-job";

const job = {
  jobId: "0291d65a-a810-4ca2-8c27-28f98b11fb94",
  attempt: 2,
  assetId: "e7371b07-6646-4b62-b559-4ced9e1a56d1",
  projectId: "1a6e6575-6179-4096-a50d-96b0950c7760",
  originalFileName: "scan.laz",
  originalObjectKey: "original.laz",
  sizeBytes: 1000,
};
const update = {
  phase: "converting" as const,
  percent: 42,
  updatedAt: "2026-11-13T12:00:00.000Z",
};
function storage() {
  return {
    createUploadUrl: vi.fn(),
    createDownloadUrl: vi.fn(),
    createInternalDownloadUrl: vi.fn(),
    statObject: vi.fn(),
    readObject: vi.fn(),
    readObjectStream: vi.fn(),
    writeObject: vi
      .fn<ObjectStorage["writeObject"]>()
      .mockResolvedValue(undefined),
    writeObjectStream: vi.fn(),
    deleteObject: vi.fn(async () => {}),
  } satisfies ObjectStorage;
}

describe("remote point-cloud progress", () => {
  afterEach(() => vi.useRealTimers());
  it("coalesces frequent updates and flushes before closing", async () => {
    const target = storage();
    const publisher = new RemotePointCloudProgress(target, job);
    try {
      for (let percent = 0; percent <= 100; percent++)
        publisher.report({ phase: "downloading", percent });
      expect(target.writeObject).not.toHaveBeenCalled();
      await publisher.flush();
      expect(target.writeObject).toHaveBeenCalledTimes(1);
      const snapshot = JSON.parse(
        new TextDecoder().decode(target.writeObject.mock.calls[0][0].body),
      );
      expect(snapshot).toMatchObject({
        jobId: job.jobId,
        attempt: 2,
        progress: { phase: "downloading", percent: 100 },
      });
      publisher.report({ phase: "publishing", percent: null });
    } finally {
      await publisher.close();
    }
    expect(target.writeObject).toHaveBeenCalledTimes(2);
  });
  it("serializes in-flight writes and closes with the newest snapshot", async () => {
    const target = storage();
    let finishFirst!: () => void;
    target.writeObject.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishFirst = resolve;
        }),
    );
    const publisher = new RemotePointCloudProgress(target, job);
    publisher.report({ phase: "converting", percent: 10 });
    const first = publisher.flush();
    publisher.report({ phase: "converting", percent: 20 });
    const last = publisher.close();
    expect(target.writeObject).toHaveBeenCalledTimes(1);
    finishFirst();
    await Promise.all([first, last]);
    expect(
      target.writeObject.mock.calls.map(
        ([input]) =>
          JSON.parse(new TextDecoder().decode(input.body)).progress.percent,
      ),
    ).toEqual([10, 20]);
  });

  it("keeps conversion successful when progress publication fails", async () => {
    const target = storage();
    const writes: string[] = [];
    target.statObject.mockImplementation(async (key: string) =>
      key === job.originalObjectKey ? { contentLength: job.sizeBytes } : null,
    );
    target.writeObject.mockImplementation(async ({ objectKey }) => {
      writes.push(objectKey);
      if (objectKey === remotePointCloudProgressKey(job))
        throw new Error("S3 progress unavailable");
    });
    const result = {
      format: "copc-v1" as const,
      processor: "Untwine",
      processorVersion: "1.5.1",
      copcObjectKey: `${remotePointCloudPrefix(job)}/cloud.copc.laz`,
      pointCount: 1,
      spacing: 1,
    };
    await runRemotePointCloudJob({
      job,
      storage: target,
      artifacts: {
        build: async (_asset, report) => {
          report?.(update);
          return result;
        },
        remove: vi.fn(),
      },
    });
    expect(writes.at(-1)).toBe(remotePointCloudOutcomeKey(job));
    expect(target.deleteObject).toHaveBeenCalledWith(
      remotePointCloudProgressKey(job),
    );
  });
  it("persists only progress belonging to the current attempt and cleans it on completion", async () => {
    for (const attempt of [1, 2]) {
      const target = storage();
      let outcomeAvailable = false;
      const result = {
        format: "copc-v1",
        processor: "Untwine",
        processorVersion: "1.5.1",
        copcObjectKey: `${remotePointCloudPrefix(job)}/cloud.copc.laz`,
        pointCount: 1,
        spacing: 1,
      };
      target.statObject.mockImplementation(async (key: string) => {
        if (key === remotePointCloudOutcomeKey(job))
          return outcomeAvailable ? { contentLength: 800 } : null;
        return {
          contentLength: key === job.originalObjectKey ? job.sizeBytes : 200,
        };
      });
      target.readObject.mockImplementation(async (key: string) => {
        if (key === remotePointCloudProgressKey(job)) {
          outcomeAvailable = true;
          return new TextEncoder().encode(
            JSON.stringify({
              jobId: job.jobId,
              attempt,
              sequence: 1,
              progress: update,
            }),
          );
        }
        return new TextEncoder().encode(
          JSON.stringify({
            jobId: job.jobId,
            attempt: job.attempt,
            status: "succeeded",
            result,
          }),
        );
      });
      const repository = {
        findPointCloudAsset: vi.fn(async () => ({ id: job.assetId, ...job })),
        saveResult: vi.fn(async () => true),
        saveProgress: vi.fn(async () => true),
      };
      const handler = createProcessRemotePointCloudAssetHandler({
        repository,
        storage: target,
        launcher: { launch: vi.fn() },
        pollIntervalMs: 0,
        resultTimeoutMs: 1000,
        workerId: "worker",
      });
      await handler({
        id: job.jobId,
        assetId: job.assetId,
        type: "process_point_cloud",
        attempt: 2,
        maxAttempts: 3,
      });
      expect(repository.saveProgress).toHaveBeenCalledTimes(
        attempt === 2 ? 1 : 0,
      );
      expect(target.deleteObject).toHaveBeenCalledWith(
        remotePointCloudProgressKey(job),
      );
    }
  });
});
