import { createWriteStream } from "node:fs";
import { mkdir, rename, stat, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const safeAssetId = /^[a-f0-9-]{36}$/i;

export type IfcMcpCacheSource = {
  assetId: string;
  objectKey: string;
  sizeBytes: number;
};

export type ObjectStreamReader = {
  readObjectStream(objectKey: string): Promise<AsyncIterable<Uint8Array>>;
};

export type LocalIfcMcpModelCacheOptions = {
  cacheDirectory: string;
  mcpModelDirectory: string;
};

export class LocalIfcMcpModelCache {
  private readonly writes = new Map<string, Promise<string>>();

  constructor(
    private readonly storage: ObjectStreamReader,
    private readonly options: LocalIfcMcpModelCacheOptions,
  ) {
    if (
      !isAbsolute(options.cacheDirectory) ||
      !isAbsolute(options.mcpModelDirectory)
    ) {
      throw new Error("IFC MCP model directories must be absolute paths");
    }
  }

  ensure(source: IfcMcpCacheSource) {
    if (!safeAssetId.test(source.assetId)) {
      return Promise.reject(new Error("Invalid IFC asset id for MCP cache"));
    }
    if (!Number.isSafeInteger(source.sizeBytes) || source.sizeBytes <= 0) {
      return Promise.reject(new Error("Invalid IFC asset size for MCP cache"));
    }

    const active = this.writes.get(source.assetId);
    if (active) return active;

    const write = this.materialize(source).finally(() => {
      this.writes.delete(source.assetId);
    });
    this.writes.set(source.assetId, write);
    return write;
  }

  async remove(assetId: string) {
    if (!safeAssetId.test(assetId)) {
      throw new Error("Invalid IFC asset id for MCP cache");
    }
    await this.writes.get(assetId)?.catch(() => undefined);
    await unlink(join(this.options.cacheDirectory, `${assetId}.ifc`)).catch(
      ignoreMissingFile,
    );
  }

  private async materialize(source: IfcMcpCacheSource) {
    await mkdir(this.options.cacheDirectory, { recursive: true, mode: 0o700 });
    const fileName = `${source.assetId}.ifc`;
    const cachePath = join(this.options.cacheDirectory, fileName);
    const mcpPath = join(this.options.mcpModelDirectory, fileName);

    if ((await fileSize(cachePath)) === source.sizeBytes) {
      return mcpPath;
    }

    await unlink(cachePath).catch(ignoreMissingFile);
    const temporaryPath = `${cachePath}.${process.pid}.${crypto.randomUUID()}.part`;

    try {
      const stream = await this.storage.readObjectStream(source.objectKey);
      await pipeline(
        Readable.from(stream),
        createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 }),
      );
      const writtenSize = await fileSize(temporaryPath);
      if (writtenSize !== source.sizeBytes) {
        throw new Error(
          `Incomplete IFC MCP cache copy: expected ${source.sizeBytes}, received ${writtenSize}`,
        );
      }
      await rename(temporaryPath, cachePath);
      return mcpPath;
    } catch (error) {
      await unlink(temporaryPath).catch(ignoreMissingFile);
      throw error;
    }
  }
}

async function fileSize(path: string) {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if (isMissingFile(error)) return null;
    throw error;
  }
}

function isMissingFile(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function ignoreMissingFile(error: unknown) {
  if (!isMissingFile(error)) throw error;
}
