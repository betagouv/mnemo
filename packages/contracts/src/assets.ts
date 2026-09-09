import { z } from "zod";

import { projectIdSchema } from "./projects";

export const assetIdSchema = z.uuid();
export type AssetId = z.infer<typeof assetIdSchema>;

export const assetKindSchema = z.enum(["ifc", "point_cloud"]);
export const assetStatusSchema = z.enum([
  "upload_pending",
  "uploaded",
  "processing",
  "ready",
  "failed",
]);

export const listAssetsInputSchema = z.object({
  projectId: projectIdSchema,
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

export type AssetSummary = z.infer<typeof assetSummarySchema>;
export type AssetList = z.infer<typeof assetListSchema>;
export type ListAssetsInput = z.infer<typeof listAssetsInputSchema>;
