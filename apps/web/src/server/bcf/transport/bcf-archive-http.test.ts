import { describe, expect, it, vi } from "vitest";

import { BcfArchiveTooLargeError } from "../application/bcf-topic-errors";
import {
  exportBcfArchiveResponse,
  importBcfArchiveResponse,
} from "./bcf-archive-http";

const projectId = "d14ccec4-b8c9-437e-89af-0690c9c9682b";

function service() {
  return {
    exportArchive: vi.fn(async () => ({
      bytes: new Uint8Array([80, 75]),
      fileName: "Projet.bcfzip",
    })),
    importArchive: vi.fn(async () => ({
      topics: [],
      imported: { topics: 1, comments: 2, viewpoints: 1, snapshots: 1 },
      skippedTopics: 0,
      warnings: [],
    })),
  };
}

describe("BCF archive HTTP transport", () => {
  it("returns an attachment without exposing storage details", async () => {
    const response = await exportBcfArchiveResponse({
      actorId: "actor",
      projectId,
      service: service(),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("content-disposition")).toContain(
      "Projet.bcfzip",
    );
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([80, 75]),
    );
  });

  it("imports the raw archive through the authorized service", async () => {
    const archiveService = service();
    const response = await importBcfArchiveResponse({
      actorId: "actor",
      projectId,
      request: new Request("http://mnemo.local/api/bcf", {
        method: "POST",
        body: new Uint8Array([80, 75]),
      }),
      service: archiveService,
    });

    expect(response.status).toBe(200);
    expect(archiveService.importArchive).toHaveBeenCalledWith(
      "actor",
      projectId,
      new Uint8Array([80, 75]),
    );
    await expect(response.json()).resolves.toMatchObject({
      imported: { topics: 1, comments: 2 },
    });
  });

  it("rejects an oversized request before reading its body", async () => {
    const response = await importBcfArchiveResponse({
      actorId: "actor",
      projectId,
      request: new Request("http://mnemo.local/api/bcf", {
        method: "POST",
        headers: { "content-length": String(51 * 1024 * 1024) },
      }),
      service: service(),
    });

    expect(response.status).toBe(413);
  });

  it("maps application archive limits to HTTP 413", async () => {
    const archiveService = service();
    archiveService.importArchive.mockRejectedValueOnce(
      new BcfArchiveTooLargeError("Archive trop grande"),
    );

    const response = await importBcfArchiveResponse({
      actorId: "actor",
      projectId,
      request: new Request("http://mnemo.local/api/bcf", {
        method: "POST",
        body: new Uint8Array([80, 75]),
      }),
      service: archiveService,
    });

    expect(response.status).toBe(413);
  });
});
