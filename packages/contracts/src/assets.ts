import { z } from "zod";
import { assetKinds, assetStatuses } from "@mnemo/domain/asset";

import { projectIdSchema } from "./projects";

export const assetIdSchema = z.uuid();
export type AssetId = z.infer<typeof assetIdSchema>;

export const assetKindSchema = z.enum(assetKinds);
export type AssetKind = z.infer<typeof assetKindSchema>;
export const assetStatusSchema = z.enum(assetStatuses);
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

export const openAssetInputSchema = z.object({
  projectId: projectIdSchema,
  assetId: assetIdSchema,
});

export const deleteAssetInputSchema = openAssetInputSchema;
export const deletionAcceptedSchema = z.object({ accepted: z.literal(true) });

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

export const openAssetResultSchema = z.object({
  asset: assetSummarySchema,
  downloadUrl: z.url(),
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
export type OpenAssetInput = z.infer<typeof openAssetInputSchema>;
export type OpenAssetResult = z.infer<typeof openAssetResultSchema>;
export type DeleteAssetInput = z.infer<typeof deleteAssetInputSchema>;
