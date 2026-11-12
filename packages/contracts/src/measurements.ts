import { z } from "zod";
import { distanceBetween, surfaceArea } from "@mnemo/domain/measurement";

export const measurementPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});
export const measurementPointsSchema = z
  .array(measurementPointSchema)
  .min(2)
  .max(500);
export const measurementContextSchema = z.object({ projectId: z.uuid() });
export const saveMeasurementSchema = measurementContextSchema
  .extend({
    id: z.uuid(),
    version: z.number().int().positive().optional(),
    floorPlanId: z.uuid().nullable(),
    name: z.string().trim().min(1).max(160),
    kind: z.enum(["distance", "surface"]),
    points: measurementPointsSchema,
  })
  .superRefine((input, ctx) => {
    if (input.floorPlanId && input.kind !== "distance")
      ctx.addIssue({
        code: "custom",
        message: "Les vues en plan prennent en charge les mesures de distance.",
        path: ["kind"],
      });
    if (input.kind === "distance") {
      if (
        input.points.length !== 2 ||
        distanceBetween(input.points[0]!, input.points[1]!) < 1e-6
      )
        ctx.addIssue({
          code: "custom",
          message: "Une distance nécessite deux points distincts.",
          path: ["points"],
        });
    } else {
      const result = surfaceArea(input.points);
      if ("error" in result)
        ctx.addIssue({
          code: "custom",
          message: result.error,
          path: ["points"],
        });
    }
  });
export const deleteMeasurementSchema = measurementContextSchema.extend({
  id: z.uuid(),
  version: z.number().int().positive(),
});
export type SaveMeasurementInput = z.infer<typeof saveMeasurementSchema>;
export type DeleteMeasurementInput = z.infer<typeof deleteMeasurementSchema>;
export type SavedMeasurement = Omit<SaveMeasurementInput, "version"> & {
  version: number;
  createdBy: string;
  updatedAt: string;
};
