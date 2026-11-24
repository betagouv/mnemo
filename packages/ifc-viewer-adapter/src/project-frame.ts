import type { MeshData, SpatialFrameOffset } from "@ifc-lite/geometry";
import type {
  MapReference,
  ProjectMapReference,
} from "@mnemo/contracts/map-reference";
import {
  classifyIfcGeoreferencing,
  readMapReference,
  type IfcGeoreference,
} from "./georeferencing";
import {
  alignModel,
  findMapPositionIssue,
  interpretReference,
  isAtMapPosition,
  mapFrame,
  modelCenter,
  sameLabel,
  type IfcPositioningIssue,
  type ModelAlignment,
  type Point,
} from "./model-alignment";

export type ProjectFrameOptions = {
  /** The frame persisted with the project, if any. */
  reference?: ProjectMapReference | null;
  /** Persist the first frame and return the one the project retained. */
  pin?: (candidate: ProjectMapReference) => Promise<ProjectMapReference>;
};

type PositionInput = {
  assetId: string;
  georeference: IfcGeoreference | null;
  lengthUnitScale: number | undefined;
  rtc: SpatialFrameOffset;
  meshes: readonly MeshData[];
};

function missingReference({
  georeference,
}: PositionInput): IfcPositioningIssue {
  const { kind } = classifyIfcGeoreferencing(georeference);
  if (kind === "projected") return "invalid-conversion";
  return kind === "site-only" ? "site-only" : "no-georeference";
}

/**
 * Owns the coordinates shared by every model of a project: the engineering frame
 * of its first georeferenced model. Models without a usable georeference keep
 * their authored coordinates.
 */
export class ProjectFrame {
  private reference: ProjectMapReference | null;
  private readonly pin: NonNullable<ProjectFrameOptions["pin"]>;
  private readonly localCenters: Point[] = [];
  private readonly unknownGrids: MapReference[] = [];

  constructor(options: ProjectFrameOptions = {}) {
    this.reference = options.reference ?? null;
    this.pin = options.pin ?? (async (candidate) => candidate);
  }

  /** Whether the model's authored coordinates are known to be the project's. */
  keepsAuthoredCoordinates(assetId: string) {
    return !this.reference || this.reference.assetId === assetId;
  }

  async position(input: PositionInput): Promise<ModelAlignment> {
    const center = modelCenter(input.meshes, input.rtc);
    const declared = readMapReference(
      input.georeference,
      input.lengthUnitScale,
    );
    const { reference, assumed } = interpretReference(
      declared,
      this.reference,
      center,
    );
    if (!reference) return this.keepAuthored(center, missingReference(input));
    const issue = await findMapPositionIssue(reference, this.reference, center);
    if (issue === "unknown-crs")
      return this.alignUnknownGrid(reference, center);
    if (issue) return this.keepAuthored(center, issue);
    this.reference ??= await this.pinReference(
      input.assetId,
      reference,
      declared ?? reference,
    );
    const alignment =
      this.reference.assetId === input.assetId
        ? { transform: null, issues: [] }
        : await alignModel(reference, this.reference, center);
    return assumed
      ? {
          ...alignment,
          issues: [...alignment.issues, "assumed-map-coordinates"],
        }
      : alignment;
  }

  private keepAuthored(
    center: Point,
    issue: IfcPositioningIssue,
  ): ModelAlignment {
    this.localCenters.push(center);
    return { transform: null, issues: [issue] };
  }

  private pinReference(
    assetId: string,
    reference: MapReference,
    declared: MapReference,
  ) {
    // Models already displayed at map coordinates define the frame.
    return this.pin(
      this.localCenters.some((center) => isAtMapPosition(center, declared))
        ? { ...mapFrame(reference), assetId: null }
        : { ...reference, assetId },
    );
  }

  /** Models sharing an unrecognised CRS label can still be aligned together. */
  private async alignUnknownGrid(
    reference: MapReference,
    center: Point,
  ): Promise<ModelAlignment> {
    const grid = this.unknownGrids.find(({ crs }) =>
      sameLabel(crs, reference.crs),
    );
    if (!grid) {
      this.unknownGrids.push(reference);
      return this.keepAuthored(center, "unknown-crs");
    }
    const { transform, issues } = await alignModel(reference, grid, center);
    return { transform, issues: [...issues, "unknown-crs"] };
  }
}
