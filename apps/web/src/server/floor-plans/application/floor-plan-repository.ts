import type {
  DeleteFloorPlanInput,
  SavedFloorPlan,
  SaveFloorPlanInput,
} from "@mnemo/contracts/floor-plans";

export interface FloorPlanRepository {
  list(projectId: string): Promise<SavedFloorPlan[]>;
  save(input: SaveFloorPlanInput): Promise<SavedFloorPlan>;
  delete(input: DeleteFloorPlanInput): Promise<void>;
}
export class FloorPlanConflictError extends Error {
  constructor() {
    super(
      "Cette vue a été modifiée ou supprimée. Rechargez la page avant de réessayer.",
    );
  }
}
export class FloorPlanSourceError extends Error {
  constructor(message = "La maquette IFC de cette vue n'est plus disponible.") {
    super(message);
  }
}
