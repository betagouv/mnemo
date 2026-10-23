"use server";

import {
  addBcfCommentInputSchema,
  beginBcfViewpointCaptureInputSchema,
  completeBcfViewpointCaptureInputSchema,
  createBcfTopicInputSchema,
  updateBcfTopicStatusInputSchema,
  type AddBcfCommentInput,
  type BeginBcfViewpointCaptureInput,
  type CompleteBcfViewpointCaptureInput,
  type CreateBcfTopicInput,
  type UpdateBcfTopicStatusInput,
} from "@mnemo/contracts/bcf";

import { resolveActor } from "@/server/auth/resolve-actor";

import { getBcfTopicService } from "./bcf-topic-service-factory";

export async function createBcfTopic(input: CreateBcfTopicInput) {
  return getBcfTopicService().create(
    (await resolveActor()).id,
    createBcfTopicInputSchema.parse(input),
  );
}

export async function addBcfComment(input: AddBcfCommentInput) {
  return getBcfTopicService().addComment(
    (await resolveActor()).id,
    addBcfCommentInputSchema.parse(input),
  );
}

export async function updateBcfTopicStatus(input: UpdateBcfTopicStatusInput) {
  return getBcfTopicService().updateStatus(
    (await resolveActor()).id,
    updateBcfTopicStatusInputSchema.parse(input),
  );
}

export async function beginBcfViewpointCapture(
  input: BeginBcfViewpointCaptureInput,
) {
  return getBcfTopicService().beginViewpointCapture(
    (await resolveActor()).id,
    beginBcfViewpointCaptureInputSchema.parse(input),
  );
}

export async function completeBcfViewpointCapture(
  input: CompleteBcfViewpointCaptureInput,
) {
  return getBcfTopicService().completeViewpointCapture(
    (await resolveActor()).id,
    completeBcfViewpointCaptureInputSchema.parse(input),
  );
}
