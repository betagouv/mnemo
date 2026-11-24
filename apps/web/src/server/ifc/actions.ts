"use server";

import type { PinProjectMapReferenceInput } from "@mnemo/contracts/map-reference";
import { resolveActor } from "@/server/auth/resolve-actor";

import { getMapReferenceService } from "./map-reference-service-factory";

export async function pinProjectMapReference(
  input: PinProjectMapReferenceInput,
) {
  return getMapReferenceService().pin((await resolveActor()).id, input);
}
