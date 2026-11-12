import type {
  SavedBimFilters,
  SaveBimFiltersInput,
} from "@mnemo/contracts/bim-filters";

export interface BimFilterRepository {
  list(projectId: string): Promise<SavedBimFilters[]>;
  save(input: SaveBimFiltersInput): Promise<SavedBimFilters>;
}
export class BimFilterConflictError extends Error {
  constructor() {
    super(
      "Ces filtres ont été modifiés dans une autre session. Rechargez la page avant de réessayer.",
    );
  }
}
export class BimFilterSourceError extends Error {
  constructor() {
    super("La maquette IFC n'est plus disponible dans ce dossier.");
  }
}
