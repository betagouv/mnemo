"use server";

import { ZodError } from "zod";
import type { SaveBimFiltersInput } from "@mnemo/contracts/bim-filters";
import { resolveActor } from "@/server/auth/resolve-actor";
import { BimFilterAccessDeniedError } from "./application/bim-filter-service";
import {
  BimFilterConflictError,
  BimFilterSourceError,
} from "./application/bim-filter-repository";
import { getBimFilterService } from "./bim-filter-service-factory";

export async function saveBimFilters(input: SaveBimFiltersInput) {
  const actor = await resolveActor();
  try {
    return { filters: await getBimFilterService().save(actor.id, input) };
  } catch (error) {
    if (
      error instanceof BimFilterAccessDeniedError ||
      error instanceof BimFilterConflictError ||
      error instanceof BimFilterSourceError
    )
      return { error: error.message };
    if (error instanceof ZodError)
      return { error: "Vérifiez les noms et les critères des filtres." };
    console.error("BIM filter save failed", error);
    return { error: "Impossible d'enregistrer les filtres. Réessayez." };
  }
}
