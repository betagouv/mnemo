import { unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import type {
  DeletionJobLease,
  WorkingCopyCleaner,
} from "../application/delete-resource";

const safeAssetId = /^[a-f0-9-]{36}$/i;
const assetKeySegment = /\/assets\/([a-f0-9-]{36})\//gi;

export class LocalIfcMcpCacheCleaner implements WorkingCopyCleaner {
  constructor(private readonly cacheDirectory: string) {
    if (!isAbsolute(cacheDirectory)) {
      throw new Error("IFC MCP cache directory must be absolute");
    }
  }

  async deleteWorkingCopies(job: DeletionJobLease) {
    const assetIds = new Set<string>();
    if (job.type === "delete_asset" && safeAssetId.test(job.resourceId)) {
      assetIds.add(job.resourceId);
    }
    for (const objectKey of job.objectKeys) {
      assetKeySegment.lastIndex = 0;
      const match = assetKeySegment.exec(`/${objectKey}`);
      if (match?.[1]) assetIds.add(match[1]);
    }

    await Promise.all(
      [...assetIds].map((assetId) =>
        unlink(join(this.cacheDirectory, `${assetId}.ifc`)).catch((error) => {
          if (!(
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          )) {
            throw error;
          }
        }),
      ),
    );
  }
}
