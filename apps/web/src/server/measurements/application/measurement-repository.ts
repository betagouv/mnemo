import type {
  SavedMeasurement,
  SaveMeasurementInput,
  DeleteMeasurementInput,
} from "@mnemo/contracts/measurements";
export interface MeasurementRepository {
  list(projectId: string): Promise<SavedMeasurement[]>;
  save(actorId: string, input: SaveMeasurementInput): Promise<SavedMeasurement>;
  delete(input: DeleteMeasurementInput): Promise<void>;
}
export class MeasurementConflictError extends Error {
  constructor() {
    super(
      "Cette mesure a été modifiée ou supprimée. Rechargez la page avant de réessayer.",
    );
  }
}
export class MeasurementPlanError extends Error {
  constructor() {
    super("La vue en plan n'est plus disponible dans ce dossier.");
  }
}
