import { bcfArchiveImportResultSchema } from "@mnemo/contracts/bcf";
import { projectIdSchema } from "@mnemo/contracts/projects";

import type { BcfTopicService } from "../application/bcf-topic-service";
import {
  BcfArchiveInvalidError,
  BcfArchiveTooLargeError,
  BcfTopicAccessDeniedError,
} from "../application/bcf-topic-errors";

const maxArchiveBytes = 50 * 1024 * 1024;

type ArchiveService = Pick<BcfTopicService, "exportArchive" | "importArchive">;

function errorResponse(error: unknown) {
  if (error instanceof BcfTopicAccessDeniedError) {
    return Response.json({ error: error.message }, { status: 403 });
  }
  if (error instanceof BcfArchiveTooLargeError) {
    return Response.json({ error: error.message }, { status: 413 });
  }
  if (error instanceof BcfArchiveInvalidError) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  console.error(
    JSON.stringify({
      event: "bcf_archive_request_failed",
      message: error instanceof Error ? error.message : "Unknown error",
    }),
  );
  return Response.json({ error: "L’échange BCF a échoué." }, { status: 500 });
}

function parseProjectId(value: string) {
  const result = projectIdSchema.safeParse(value);
  return result.success ? result.data : null;
}

async function readBodyCapped(request: Request) {
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxArchiveBytes) {
        throw new BcfArchiveTooLargeError(
          "L’archive BCF dépasse la limite de 50 Mio.",
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function exportBcfArchiveResponse(input: {
  actorId: string;
  projectId: string;
  service: ArchiveService;
}) {
  const projectId = parseProjectId(input.projectId);
  if (!projectId) {
    return Response.json(
      { error: "Identifiant de projet invalide." },
      { status: 400 },
    );
  }

  try {
    const archive = await input.service.exportArchive(input.actorId, projectId);
    const responseBody = Uint8Array.from(archive.bytes).buffer;
    return new Response(responseBody, {
      status: 200,
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(archive.fileName)}`,
        "content-length": String(archive.bytes.byteLength),
        "content-type": "application/zip",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function importBcfArchiveResponse(input: {
  actorId: string;
  projectId: string;
  request: Request;
  service: ArchiveService;
}) {
  const projectId = parseProjectId(input.projectId);
  if (!projectId) {
    return Response.json(
      { error: "Identifiant de projet invalide." },
      { status: 400 },
    );
  }

  const declaredLength = Number(input.request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxArchiveBytes) {
    return Response.json(
      { error: "L’archive BCF dépasse la limite de 50 Mio." },
      { status: 413 },
    );
  }

  try {
    const bytes = await readBodyCapped(input.request);
    const result = await input.service.importArchive(
      input.actorId,
      projectId,
      bytes,
    );
    return Response.json(bcfArchiveImportResultSchema.parse(result), {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
