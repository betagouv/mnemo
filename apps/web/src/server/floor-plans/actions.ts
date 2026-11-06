"use server";
import type {
  SaveFloorPlanInput,
  DeleteFloorPlanInput,
} from "@mnemo/contracts/floor-plans";
import { resolveActor } from "@/server/auth/resolve-actor";
import { FloorPlanAccessDeniedError } from "./application/floor-plan-service";
import {
  FloorPlanConflictError,
  FloorPlanSourceError,
} from "./application/floor-plan-repository";
import { getFloorPlanService } from "./floor-plan-service-factory";

function message(error: unknown) {
  if (
    error instanceof FloorPlanAccessDeniedError ||
    error instanceof FloorPlanConflictError ||
    error instanceof FloorPlanSourceError
  )
    return error.message;
  console.error("Floor plan mutation failed", error);
  return "Impossible d'enregistrer la modification. Réessayez.";
}
export async function saveFloorPlan(input: SaveFloorPlanInput) {
  const actor = await resolveActor();
  try {
    return { plan: await getFloorPlanService().save(actor.id, input) };
  } catch (error) {
    return { error: message(error) };
  }
}
export async function deleteFloorPlan(input: DeleteFloorPlanInput) {
  const actor = await resolveActor();
  try {
    await getFloorPlanService().delete(actor.id, input);
    return { success: true };
  } catch (error) {
    return { error: message(error) };
  }
}
