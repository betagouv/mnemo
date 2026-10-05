"use server";

import {
  beginAssetUploadInputSchema,
  completeAssetUploadInputSchema,
  deleteAssetInputSchema,
  type BeginAssetUploadInput,
  type CompleteAssetUploadInput,
  type DeleteAssetInput,
} from "@mnemo/contracts/assets";

import { disposeIfcMcpAsset } from "@/server/assistant/infrastructure/ifc-mcp-runtime";
import { resolveActor } from "@/server/auth/resolve-actor";

import { getAssetService } from "./asset-service-factory";

export async function beginAssetUpload(input: BeginAssetUploadInput) {
  return getAssetService().beginUpload(
    resolveActor().id,
    beginAssetUploadInputSchema.parse(input),
  );
}

export async function completeAssetUpload(input: CompleteAssetUploadInput) {
  return getAssetService().completeUpload(
    resolveActor().id,
    completeAssetUploadInputSchema.parse(input),
  );
}

export async function deleteAsset(input: DeleteAssetInput) {
  const parsed = deleteAssetInputSchema.parse(input);
  const result = await getAssetService().delete(resolveActor().id, parsed);
  await disposeIfcMcpAsset(parsed.assetId).catch((error) => {
    console.error("Failed to dispose IFC MCP asset cache", {
      assetId: parsed.assetId,
      error,
    });
  });
  return result;
}
