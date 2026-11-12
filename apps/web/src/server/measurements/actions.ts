"use server";
import { ZodError } from "zod";
import type {
  SaveMeasurementInput,
  DeleteMeasurementInput,
} from "@mnemo/contracts/measurements";
import { resolveActor } from "@/server/auth/resolve-actor";
import { MeasurementAccessDeniedError } from "./application/measurement-service";
import {
  MeasurementConflictError,
  MeasurementPlanError,
} from "./application/measurement-repository";
import { getMeasurementService } from "./measurement-service-factory";
function message(error: unknown) {
  if (
    error instanceof MeasurementAccessDeniedError ||
    error instanceof MeasurementConflictError ||
    error instanceof MeasurementPlanError
  )
    return error.message;
  if (error instanceof ZodError)
    return "Vérifiez le nom et les points de la mesure.";
  console.error("Measurement mutation failed", error);
  return "La modification des mesures a échoué. Réessayez.";
}
export async function saveMeasurement(input: SaveMeasurementInput) {
  const actor = await resolveActor();
  try {
    return { measurement: await getMeasurementService().save(actor.id, input) };
  } catch (error) {
    return { error: message(error) };
  }
}
export async function deleteMeasurement(input: DeleteMeasurementInput) {
  const actor = await resolveActor();
  try {
    await getMeasurementService().delete(actor.id, input);
    return { success: true };
  } catch (error) {
    return { error: message(error) };
  }
}
