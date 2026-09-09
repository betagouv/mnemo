import { z } from "zod";

import { assetIdSchema } from "./assets";
import { projectIdSchema } from "./projects";

const finiteNumberSchema = z.number().finite();
const scaleSchema = finiteNumberSchema.refine((value) => value !== 0, {
  message: "Scale must not be zero",
});

export const pointCloudTransformSchema = z.object({
  position: z.tuple([
    finiteNumberSchema,
    finiteNumberSchema,
    finiteNumberSchema,
  ]),
  rotationDegrees: z.tuple([
    finiteNumberSchema,
    finiteNumberSchema,
    finiteNumberSchema,
  ]),
  scale: z.tuple([scaleSchema, scaleSchema, scaleSchema]),
});

export const pointCloudSettingsInputSchema = z.object({
  projectId: projectIdSchema,
  assetId: assetIdSchema,
});

export const updatePointCloudSettingsInputSchema =
  pointCloudSettingsInputSchema.extend({
    transform: pointCloudTransformSchema,
    sourceCrs: z.string().trim().max(160).nullable(),
    targetCrs: z.string().trim().max(160).nullable(),
  });

export const pointCloudSettingsSchema = z.object({
  assetId: assetIdSchema,
  transform: pointCloudTransformSchema,
  sourceCrs: z.string().nullable(),
  targetCrs: z.string().nullable(),
  updatedAt: z.iso.datetime().nullable(),
});

export type PointCloudTransform = z.infer<typeof pointCloudTransformSchema>;
export type PointCloudSettingsInput = z.infer<
  typeof pointCloudSettingsInputSchema
>;
export type UpdatePointCloudSettingsInput = z.infer<
  typeof updatePointCloudSettingsInputSchema
>;
export type PointCloudSettings = z.infer<typeof pointCloudSettingsSchema>;
