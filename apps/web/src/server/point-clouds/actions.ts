"use server";

import {
  updatePointCloudSettingsInputSchema,
  type UpdatePointCloudSettingsInput,
} from "@mnemo/contracts/point-clouds";

import { resolveActor } from "@/server/auth/resolve-actor";

import { getPointCloudSettingsService } from "./point-cloud-settings-service-factory";

export async function updatePointCloudSettings(
  input: UpdatePointCloudSettingsInput,
) {
  return getPointCloudSettingsService().update(
    resolveActor().id,
    updatePointCloudSettingsInputSchema.parse(input),
  );
}
