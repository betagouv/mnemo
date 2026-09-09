import { z } from "zod";

import { projectIdSchema } from "./projects";

export const assetIdSchema = z.uuid();
export type AssetId = z.infer<typeof assetIdSchema>;

export const assetKindSchema = z.enum(["ifc", "point_cloud"]);
export type AssetKind = z.infer<typeof assetKindSchema>;
export const assetStatusSchema = z.enum([
  "upload_pending",
  "uploaded",
  "processing",
  "ready",
  "failed",
]);
export type AssetStatus = z.infer<typeof assetStatusSchema>;

export const listAssetsInputSchema = z.object({
  projectId: projectIdSchema,
});

export const beginAssetUploadInputSchema = z.object({
  projectId: projectIdSchema,
  kind: assetKindSchema,
  fileName: z.string().trim().min(1).max(512),
  mediaType: z.string().trim().min(1).max(255),
  sizeBytes: z
    .int()
    .positive()
    .max(5 * 1_024 ** 3),
});

export const completeAssetUploadInputSchema = z.object({
  projectId: projectIdSchema,
  assetId: assetIdSchema,
});

export const assetSummarySchema = z.object({
  id: assetIdSchema,
  projectId: projectIdSchema,
  kind: assetKindSchema,
  originalFileName: z.string(),
  mediaType: z.string(),
  sizeBytes: z.int().nonnegative(),
  status: assetStatusSchema,
  errorMessage: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const assetListSchema = z.array(assetSummarySchema);

export const beginAssetUploadResultSchema = z.object({
  asset: assetSummarySchema,
  uploadUrl: z.url(),
  requiredHeaders: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime(),
});

export type AssetSummary = z.infer<typeof assetSummarySchema>;
export type AssetList = z.infer<typeof assetListSchema>;
export type ListAssetsInput = z.infer<typeof listAssetsInputSchema>;
export type BeginAssetUploadInput = z.infer<typeof beginAssetUploadInputSchema>;
export type BeginAssetUploadResult = z.infer<
  typeof beginAssetUploadResultSchema
>;
export type CompleteAssetUploadInput = z.infer<
  typeof completeAssetUploadInputSchema
>;
