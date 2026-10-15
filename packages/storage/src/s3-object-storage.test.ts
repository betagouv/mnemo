import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, it, vi } from "vitest";

import { S3ObjectStorage } from "./s3-object-storage";

const uploadMocks = vi.hoisted(() => ({
  options: vi.fn((value: unknown) => value),
  done: vi.fn(async () => ({})),
}));

vi.mock("@aws-sdk/lib-storage", () => ({
  Upload: class {
    constructor(options: unknown) {
      uploadMocks.options(options);
    }

    done = uploadMocks.done;
  },
}));

const storageOptions = {
  endpoint: "https://s3.example.test",
  publicEndpoint: "https://s3.example.test",
  region: "eu-west-par",
  bucket: "mnemo",
  accessKeyId: "access-key",
  secretAccessKey: "secret-key",
};

async function* bytes() {
  yield new Uint8Array([1, 2, 3]);
}

describe("S3 streamed uploads", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    uploadMocks.options.mockClear();
    uploadMocks.done.mockClear();
  });

  it("uses one PUT for small artifacts", async () => {
    const send = vi
      .spyOn(S3Client.prototype, "send")
      .mockResolvedValue({} as never);
    const storage = new S3ObjectStorage(storageOptions);

    await storage.writeObjectStream({
      objectKey: "artifacts/metadata.json",
      contentType: "application/json",
      contentLength: 3,
      body: bytes(),
    });

    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(PutObjectCommand);
    expect(uploadMocks.options).not.toHaveBeenCalled();
  });

  it("uses bounded multipart uploads for artifacts larger than one PUT allows", async () => {
    const send = vi
      .spyOn(S3Client.prototype, "send")
      .mockResolvedValue({} as never);
    const storage = new S3ObjectStorage(storageOptions);
    const contentLength = 6 * 1024 * 1024 * 1024;

    await storage.writeObjectStream({
      objectKey: "artifacts/octree.bin",
      contentType: "application/octet-stream",
      contentLength,
      body: bytes(),
    });

    expect(send).not.toHaveBeenCalled();
    expect(uploadMocks.options).toHaveBeenCalledWith({
      client: expect.any(S3Client),
      params: expect.objectContaining({
        Bucket: "mnemo",
        Key: "artifacts/octree.bin",
        ContentLength: contentLength,
        ContentType: "application/octet-stream",
      }),
      partSize: 512 * 1024 * 1024,
      queueSize: 4,
      leavePartsOnError: false,
    });
    expect(uploadMocks.done).toHaveBeenCalledOnce();
  });

  it("allows the worker to use smaller multipart parts", async () => {
    vi.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);
    const storage = new S3ObjectStorage({
      ...storageOptions,
      multipartPartSizeBytes: 128 * 1024 * 1024,
      multipartQueueSize: 4,
      requestTimeoutMs: 5 * 60_000,
    });

    await storage.writeObjectStream({
      objectKey: "artifacts/cloud.copc.laz",
      contentType: "application/vnd.laszip",
      contentLength: 2 * 1024 * 1024 * 1024,
      body: bytes(),
    });

    expect(uploadMocks.options).toHaveBeenCalledWith(
      expect.objectContaining({
        partSize: 128 * 1024 * 1024,
        queueSize: 4,
      }),
    );
  });
});
