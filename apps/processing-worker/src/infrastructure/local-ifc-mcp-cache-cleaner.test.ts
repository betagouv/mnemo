import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LocalIfcMcpCacheCleaner } from "./local-ifc-mcp-cache-cleaner";

const directories: string[] = [];
const assetId = "00000000-0000-4000-8000-000000000020";

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

describe("LocalIfcMcpCacheCleaner", () => {
  it("deletes only asset working copies derived from server-owned ids", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mnemo-mcp-cleaner-"));
    directories.push(directory);
    const file = join(directory, `${assetId}.ifc`);
    await writeFile(file, "IFC");
    const cleaner = new LocalIfcMcpCacheCleaner(directory);

    await cleaner.deleteWorkingCopies({
      id: "job",
      type: "delete_project",
      resourceId: "00000000-0000-4000-8000-000000000010",
      objectKeys: [
        `projects/project/assets/${assetId}/original.ifc`,
        "../untrusted.ifc",
      ],
      attempt: 1,
      maxAttempts: 5,
    });

    await expect(readFile(file)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
