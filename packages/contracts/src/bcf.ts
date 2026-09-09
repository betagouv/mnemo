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

export const bcfTopicListSchema = z.array(bcfTopicSchema);

export type BcfTopic = z.infer<typeof bcfTopicSchema>;
export type BcfComment = z.infer<typeof bcfCommentSchema>;
export type BcfComponent = z.infer<typeof bcfComponentSchema>;
export type BcfTopicStatus = z.infer<typeof bcfTopicStatusSchema>;
export type BcfTopicType = z.infer<typeof bcfTopicTypeSchema>;
export type BcfPriority = z.infer<typeof bcfPrioritySchema>;
export type CreateBcfTopicInput = z.infer<typeof createBcfTopicInputSchema>;
export type AddBcfCommentInput = z.infer<typeof addBcfCommentInputSchema>;
export type UpdateBcfTopicStatusInput = z.infer<
  typeof updateBcfTopicStatusInputSchema
>;
