import { z } from "zod";

import { assetIdSchema } from "./assets";
import { projectIdSchema } from "./projects";

export const bcfTopicIdSchema = z.uuid();
export const bcfCommentIdSchema = z.uuid();
export const bcfTopicStatusSchema = z.enum([
  "open",
  "in_progress",
  "resolved",
  "closed",
]);
export const bcfTopicTypeSchema = z.enum(["issue", "request", "comment"]);
export const bcfPrioritySchema = z.enum(["low", "normal", "high", "critical"]);

export const bcfComponentSchema = z.object({
  id: z.uuid(),
  assetId: assetIdSchema.nullable(),
  globalId: z.string().trim().min(1).max(64),
  expressId: z.int().positive().nullable(),
});

export const bcfCommentSchema = z.object({
  id: bcfCommentIdSchema,
  authorName: z.string(),
  comment: z.string(),
  createdAt: z.iso.datetime(),
});

const bcfPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

const bcfComponentReferenceSchema = z.object({
  ifcGuid: z.string().trim().min(1).max(64).optional(),
});

const bcfPerspectiveCameraSchema = z.object({
  cameraViewPoint: bcfPointSchema,
  cameraDirection: bcfPointSchema,
  cameraUpVector: bcfPointSchema,
  fieldOfView: z.number().finite().positive().max(180),
  aspectRatio: z.number().finite().positive().optional(),
});

const bcfOrthogonalCameraSchema = z.object({
  cameraViewPoint: bcfPointSchema,
  cameraDirection: bcfPointSchema,
  cameraUpVector: bcfPointSchema,
  viewToWorldScale: z.number().finite().positive(),
  aspectRatio: z.number().finite().positive().optional(),
});

const bcfColoringSchema = z.object({
  color: z.string().regex(/^[0-9A-Fa-f]{8}$/),
  components: z.array(bcfComponentReferenceSchema).max(100_000),
});

export const bcfViewpointPayloadSchema = z
  .object({
    guid: z.uuid(),
    perspectiveCamera: bcfPerspectiveCameraSchema.optional(),
    orthogonalCamera: bcfOrthogonalCameraSchema.optional(),
    components: z
      .object({
        selection: z.array(bcfComponentReferenceSchema).max(100_000).optional(),
        visibility: z
          .object({
            defaultVisibility: z.boolean(),
            exceptions: z
              .array(bcfComponentReferenceSchema)
              .max(100_000)
              .optional(),
          })
          .optional(),
        coloring: z.array(bcfColoringSchema).max(256).optional(),
      })
      .optional(),
  })
  .refine(
    (viewpoint) =>
      Boolean(viewpoint.perspectiveCamera) !==
      Boolean(viewpoint.orthogonalCamera),
    "A viewpoint requires exactly one camera",
  );

export const bcfViewpointSchema = z.object({
  id: z.uuid(),
  topicId: bcfTopicIdSchema,
  data: bcfViewpointPayloadSchema,
  targetDistance: z.number().finite().positive(),
  snapshotUrl: z.url().nullable(),
  authorName: z.string(),
  createdAt: z.iso.datetime(),
});

export const bcfTopicSchema = z.object({
  id: bcfTopicIdSchema,
  projectId: projectIdSchema,
  title: z.string(),
  description: z.string().nullable(),
  type: bcfTopicTypeSchema,
  status: bcfTopicStatusSchema,
  priority: bcfPrioritySchema,
  authorName: z.string(),
  components: z.array(bcfComponentSchema),
  comments: z.array(bcfCommentSchema),
  viewpoints: z.array(bcfViewpointSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const listBcfTopicsInputSchema = z.object({
  projectId: projectIdSchema,
});

export const createBcfTopicInputSchema = z.object({
  projectId: projectIdSchema,
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10_000).optional(),
  type: bcfTopicTypeSchema.default("issue"),
  priority: bcfPrioritySchema.default("normal"),
  component: z
    .object({
      assetId: assetIdSchema,
      globalId: z.string().trim().min(1).max(64),
      expressId: z.int().positive(),
    })
    .optional(),
});

export const addBcfCommentInputSchema = z.object({
  projectId: projectIdSchema,
  topicId: bcfTopicIdSchema,
  comment: z.string().trim().min(1).max(10_000),
});

export const updateBcfTopicStatusInputSchema = z.object({
  projectId: projectIdSchema,
  topicId: bcfTopicIdSchema,
  status: bcfTopicStatusSchema,
});

export const beginBcfViewpointCaptureInputSchema = z.object({
  projectId: projectIdSchema,
  topicId: bcfTopicIdSchema,
  data: bcfViewpointPayloadSchema,
  targetDistance: z.number().finite().positive().max(1_000_000_000),
  snapshot: z
    .object({
      mediaType: z.enum(["image/png", "image/jpeg"]),
      sizeBytes: z
        .int()
        .positive()
        .max(10 * 1024 * 1024),
    })
    .optional(),
});

export const completeBcfViewpointCaptureInputSchema = z.object({
  projectId: projectIdSchema,
  topicId: bcfTopicIdSchema,
  viewpointId: z.uuid(),
});

const bcfSnapshotUploadSchema = z.object({
  uploadUrl: z.url(),
  requiredHeaders: z.record(z.string(), z.string()),
  expiresAt: z.iso.datetime(),
});

export const beginBcfViewpointCaptureResultSchema = z.object({
  topic: bcfTopicSchema,
  viewpointId: z.uuid(),
  snapshotUpload: bcfSnapshotUploadSchema.nullable(),
});

export const bcfTopicListSchema = z.array(bcfTopicSchema);

export type BcfTopic = z.infer<typeof bcfTopicSchema>;
export type BcfComment = z.infer<typeof bcfCommentSchema>;
export type BcfComponent = z.infer<typeof bcfComponentSchema>;
export type BcfViewpointPayload = z.infer<typeof bcfViewpointPayloadSchema>;
export type BcfViewpoint = z.infer<typeof bcfViewpointSchema>;
export type BcfTopicStatus = z.infer<typeof bcfTopicStatusSchema>;
export type BcfTopicType = z.infer<typeof bcfTopicTypeSchema>;
export type BcfPriority = z.infer<typeof bcfPrioritySchema>;
export type CreateBcfTopicInput = z.infer<typeof createBcfTopicInputSchema>;
export type AddBcfCommentInput = z.infer<typeof addBcfCommentInputSchema>;
export type UpdateBcfTopicStatusInput = z.infer<
  typeof updateBcfTopicStatusInputSchema
>;
export type BeginBcfViewpointCaptureInput = z.infer<
  typeof beginBcfViewpointCaptureInputSchema
>;
export type CompleteBcfViewpointCaptureInput = z.infer<
  typeof completeBcfViewpointCaptureInputSchema
>;
