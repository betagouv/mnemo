import { z } from "zod";

import { assetIdSchema } from "./assets";
import { projectIdSchema } from "./projects";

export const bcfTopicIdSchema = z.uuid();
export const bcfCommentIdSchema = z.uuid();
// BCF extension values belong to the project; imported values must retain their meaning.
export const bcfTopicStatusSchema = z.string().trim().min(1).max(100);
export const bcfTopicTypeSchema = bcfTopicStatusSchema;
export const bcfPrioritySchema = bcfTopicStatusSchema;
export const bcfDefaults = {
  statuses: ["Open", "In Progress", "Resolved", "Closed"],
  types: ["Issue", "Request", "Information"],
  priorities: ["Low", "Normal", "High", "Critical"],
} as const;

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
  viewpointBcfGuid: z.uuid().nullable(),
});

const bcfPointSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

const bcfComponentReferenceSchema = z.object({
  ifcGuid: z.string().trim().min(1).max(64).optional(),
  originatingSystem: z.string().max(320).optional(),
  authoringToolId: z.string().max(320).optional(),
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
    clippingPlanes: z
      .array(z.object({ location: bcfPointSchema, direction: bcfPointSchema }))
      .max(32)
      .optional(),
    lines: z
      .array(z.object({ startPoint: bcfPointSchema, endPoint: bcfPointSchema }))
      .max(10000)
      .optional(),
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
            viewSetupHints: z
              .object({
                spacesVisible: z.boolean().optional(),
                spaceBoundariesVisible: z.boolean().optional(),
                openingsVisible: z.boolean().optional(),
              })
              .optional(),
          })
          .optional(),
        coloring: z.array(bcfColoringSchema).max(256).optional(),
      })
      .optional(),
  })
  .refine(
    (viewpoint) => !(viewpoint.perspectiveCamera && viewpoint.orthogonalCamera),
    "A viewpoint cannot contain two cameras",
  );

export const bcfViewpointSchema = z.object({
  id: z.uuid(),
  topicId: bcfTopicIdSchema,
  data: bcfViewpointPayloadSchema,
  targetDistance: z.number().finite().positive(),
  snapshotUrl: z.string().startsWith("/api/projects/").nullable(),
  authorName: z.string(),
  createdAt: z.iso.datetime(),
});

// Protocol fields not exposed in the editor are still preserved during exchange.
export const bcfExchangeMetadataSchema = z.object({
  header: z
    .array(
      z.object({
        ifcProject: z.string().optional(),
        ifcSpatialStructureElement: z.string().optional(),
        isExternal: z.boolean().optional(),
        filename: z.string().optional(),
        date: z.string().optional(),
        reference: z.string().optional(),
      }),
    )
    .max(1000)
    .optional(),
  stage: z.string().max(1000).optional(),
  relatedTopics: z.array(z.string().max(64)).max(10000).optional(),
  documentReferences: z
    .array(
      z.object({
        guid: z.string().optional(),
        isExternal: z.boolean().optional(),
        referencedDocument: z.string().optional(),
        documentGuid: z.string().optional(),
        url: z.string().optional(),
        description: z.string().optional(),
      }),
    )
    .max(1000)
    .optional(),
  bimSnippet: z
    .object({
      snippetType: z.string(),
      isExternal: z.boolean(),
      reference: z.string(),
      referenceSchema: z.string().optional(),
    })
    .optional(),
});
export type BcfExchangeMetadata = z.infer<typeof bcfExchangeMetadataSchema>;
export const bcfTopicSchema = z.object({
  id: bcfTopicIdSchema,
  projectId: projectIdSchema,
  title: z.string(),
  description: z.string().nullable(),
  type: bcfTopicTypeSchema,
  status: bcfTopicStatusSchema,
  priority: bcfPrioritySchema,
  authorName: z.string(),
  authorEmail: z.string(),
  modifiedAuthor: z.string().nullable(),
  number: z.int().positive(),
  assignedTo: z.string().max(320).nullable(),
  dueDate: z.iso.date().nullable(),
  labels: z.array(z.string().max(100)).max(50),
  components: z.array(bcfComponentSchema),
  comments: z.array(bcfCommentSchema),
  viewpoints: z.array(bcfViewpointSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const listBcfTopicsInputSchema = z.object({
  projectId: projectIdSchema,
});

export const bcfComponentInputSchema = z.object({
  assetId: assetIdSchema.nullable(),
  globalId: z.string().trim().min(1).max(64),
  expressId: z.int().positive().nullable(),
});
export const bcfViewpointDraftSchema = z.object({
  data: bcfViewpointPayloadSchema,
  targetDistance: z.number().finite().positive().max(1_000_000_000),
  uploadId: z.uuid().optional(),
});
const topicFields = {
  title: z.string().trim().min(1).max(255),
  description: z.string().trim().max(10_000).optional(),
  type: bcfTopicTypeSchema.default("Issue"),
  priority: bcfPrioritySchema.default("Normal"),
  assignedTo: z.string().trim().min(1).max(320).nullable().default(null),
  dueDate: z.iso.date().nullable().default(null),
  labels: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  components: z.array(bcfComponentInputSchema).max(10_000).default([]),
};
export const createBcfTopicInputSchema = z.object({
  projectId: projectIdSchema,
  ...topicFields,
  viewpoint: bcfViewpointDraftSchema.optional(),
});
export const updateBcfTopicInputSchema = z.object({
  projectId: projectIdSchema,
  topicId: bcfTopicIdSchema,
  ...topicFields,
  status: bcfTopicStatusSchema,
});
export const addBcfCommentInputSchema = z.object({
  projectId: projectIdSchema,
  topicId: bcfTopicIdSchema,
  comment: z.string().trim().min(1).max(10_000),
  viewpoint: bcfViewpointDraftSchema.optional(),
});
export const updateBcfTopicStatusInputSchema = z.object({
  projectId: projectIdSchema,
  topicId: bcfTopicIdSchema,
  status: bcfTopicStatusSchema,
});
export const prepareBcfSnapshotInputSchema = z.object({
  projectId: projectIdSchema,
  mediaType: z.enum(["image/png", "image/jpeg"]),
  sizeBytes: z
    .int()
    .positive()
    .max(10 * 1024 * 1024),
});
export const saveBcfViewpointInputSchema = z.object({
  projectId: projectIdSchema,
  topicId: bcfTopicIdSchema,
  viewpoint: bcfViewpointDraftSchema,
});
export const bcfProjectOptionsSchema = z
  .object({
    statuses: z.array(bcfTopicStatusSchema).min(1).max(100),
    types: z.array(bcfTopicTypeSchema).min(1).max(100),
    priorities: z.array(bcfPrioritySchema).min(1).max(100),
  })
  .refine(
    (options) => options.statuses.includes("Open"),
    "Le statut initial Open doit rester disponible.",
  );
export type BcfProjectOptions = z.infer<typeof bcfProjectOptionsSchema>;
export type BcfViewpointDraft = z.infer<typeof bcfViewpointDraftSchema>;
export type UpdateBcfTopicInput = z.infer<typeof updateBcfTopicInputSchema>;
export type PrepareBcfSnapshotInput = z.infer<
  typeof prepareBcfSnapshotInputSchema
>;
export type SaveBcfViewpointInput = z.infer<typeof saveBcfViewpointInputSchema>;
export const bcfTopicSummarySchema = bcfTopicSchema
  .omit({ comments: true, viewpoints: true, components: true })
  .extend({ commentCount: z.int(), viewpointCount: z.int() });
export type BcfTopicSummary = z.infer<typeof bcfTopicSummarySchema>;

export const bcfTopicListSchema = z.array(bcfTopicSchema);

export const bcfArchiveImportResultSchema = z.object({
  imported: z.object({
    topics: z.int().nonnegative(),
    comments: z.int().nonnegative(),
    viewpoints: z.int().nonnegative(),
    snapshots: z.int().nonnegative(),
  }),
  skippedTopics: z.int().nonnegative(),
  warnings: z.array(z.string()).max(500),
});

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
export type BcfArchiveImportResult = z.infer<
  typeof bcfArchiveImportResultSchema
>;

export const bcfMarkerTopicSchema = z.object({
  id: bcfTopicIdSchema,
  title: z.string(),
  number: z.int(),
  type: z.string(),
  status: z.string(),
  priority: z.string(),
  viewpoint: bcfViewpointPayloadSchema.nullable(),
  targetDistance: z.number().positive(),
});
export type BcfMarkerTopic = z.infer<typeof bcfMarkerTopicSchema>;
