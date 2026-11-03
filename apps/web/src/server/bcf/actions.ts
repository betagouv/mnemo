"use server";

import {
  addBcfCommentInputSchema,
  createBcfTopicInputSchema,
  updateBcfTopicStatusInputSchema,
  updateBcfTopicInputSchema,
  prepareBcfSnapshotInputSchema,
  saveBcfViewpointInputSchema,
  type AddBcfCommentInput,
  type CreateBcfTopicInput,
  type UpdateBcfTopicStatusInput,
  type UpdateBcfTopicInput,
  type PrepareBcfSnapshotInput,
  type SaveBcfViewpointInput,
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
export async function updateBcfTopic(input: UpdateBcfTopicInput) {
  return getBcfTopicService().update(
    (await resolveActor()).id,
    updateBcfTopicInputSchema.parse(input),
  );
}
export async function prepareBcfSnapshot(input: PrepareBcfSnapshotInput) {
  return getBcfTopicService().prepareSnapshot(
    (await resolveActor()).id,
    prepareBcfSnapshotInputSchema.parse(input),
  );
}
export async function saveBcfViewpoint(input: SaveBcfViewpointInput) {
  return getBcfTopicService().saveViewpoint(
    (await resolveActor()).id,
    saveBcfViewpointInputSchema.parse(input),
  );
}
