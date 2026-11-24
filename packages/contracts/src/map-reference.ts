import { z } from "zod";

const scale = z.number().finite().positive();

/** Maps IFC engineering metres (Z up) to a coordinate reference system. */
export const mapReferenceSchema = z.object({
  crs: z.string().trim().min(1).max(512),
  verticalDatum: z.string().trim().min(1).max(512).nullable(),
  eastings: z.number().finite(),
  northings: z.number().finite(),
  orthogonalHeight: z.number().finite(),
  xAxisAbscissa: z.number().finite(),
  xAxisOrdinate: z.number().finite(),
  scaleX: scale,
  scaleY: scale,
  scaleZ: scale,
});
export type MapReference = z.infer<typeof mapReferenceSchema>;

/** The frame shared by the models, measurements and BCF viewpoints of a project. */
export const projectMapReferenceSchema = mapReferenceSchema.extend({
  /** Model whose authored coordinates are the project coordinates. */
  assetId: z.uuid().nullable(),
});
export type ProjectMapReference = z.infer<typeof projectMapReferenceSchema>;

export const pinProjectMapReferenceInputSchema = z.object({
  projectId: z.uuid(),
  reference: projectMapReferenceSchema,
});
export type PinProjectMapReferenceInput = z.infer<
  typeof pinProjectMapReferenceInputSchema
>;
