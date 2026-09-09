import { z } from "zod";

import { assetIdSchema } from "./assets";
import { projectIdSchema } from "./projects";

export const assistantThreadIdSchema = z.uuid();

export const assistantThreadSummarySchema = z.object({
  id: assistantThreadIdSchema,
  projectId: projectIdSchema,
  assetId: assetIdSchema,
  title: z.string().min(1).max(160),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const assistantMessageSchema = z.looseObject({
  id: z.string().min(1).max(256),
  role: z.enum(["system", "user", "assistant"]),
  metadata: z.unknown().optional(),
  parts: z
    .array(
      z.looseObject({
        type: z.string().min(1).max(160),
      }),
    )
    .max(512),
});

const assistantContextSchema = z.object({
  projectId: projectIdSchema,
  assetId: assetIdSchema,
});

export const listAssistantThreadsInputSchema = assistantContextSchema;
export const createAssistantThreadInputSchema = assistantContextSchema;
export const getAssistantThreadInputSchema = assistantContextSchema.extend({
  threadId: assistantThreadIdSchema,
});
export const deleteAssistantThreadInputSchema = getAssistantThreadInputSchema;

export const assistantThreadListSchema = z.array(assistantThreadSummarySchema);
export const assistantThreadHistorySchema = z.object({
  thread: assistantThreadSummarySchema,
  messages: z.array(assistantMessageSchema).max(100),
});

export type AssistantMessage = z.infer<typeof assistantMessageSchema>;
export type AssistantThreadSummary = z.infer<
  typeof assistantThreadSummarySchema
>;
export type AssistantThreadHistory = z.infer<
  typeof assistantThreadHistorySchema
>;
