import {
  sectionPlaneToClippingPlane,
  type BCFClippingPlane,
} from "@ifc-lite/bcf";
import { QUANT_STEP } from "@ifc-lite/renderer";
import type {
  ClipBox,
  PickOptions,
  Renderer,
  SectionPlane,
  SectionPlaneAxis,
} from "@ifc-lite/renderer";

import type { IfcSectionSnapshot } from "./viewer-types";

type Point = { x: number; y: number; z: number };
type Bounds = { min: Point; max: Point };
type AxisIndex = 0 | 1 | 2;

const minBoxThickness = 0.01;

function finiteBounds(bounds: Bounds | null): bounds is Bounds {
  return Boolean(
    bounds &&
    [
      bounds.min.x,
      bounds.min.y,
      bounds.min.z,
      bounds.max.x,
      bounds.max.y,
      bounds.max.z,
    ].every(Number.isFinite) &&
    bounds.max.x > bounds.min.x &&
    bounds.max.y > bounds.min.y &&
    bounds.max.z > bounds.min.z,
  );
}

function normalized(vector: Point): [number, number, number] | null {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!Number.isFinite(length) || length < 1e-6) return null;
  return [vector.x / length, vector.y / length, vector.z / length];
}

function planeAtPoint(normal: [number, number, number], point: Point) {
  return normal[0] * point.x + normal[1] * point.y + normal[2] * point.z;
}

export function createEmptySectionSnapshot(): IfcSectionSnapshot {
  return {
    active: null,
    plane: {
      source: "axis",
      axis: "down",
      position: 50,
      flipped: false,
      normal: null,
      distance: null,
      pickedAt: null,
    },
    box: null,
    pickMode: null,
    draftPoint: null,
    trace: null,
    message: null,
  };
}

/** Owns section state and translates it into IFC-Lite render options. */
export class SectionController {
  private state = createEmptySectionSnapshot();
  private lastBounds: Bounds | null = null;
  private activeBeforePick: IfcSectionSnapshot["active"] = null;
  private pickRevision = 0;
  private pickPending = false;

  constructor(
    private readonly renderer: Renderer,
    private readonly onChange: (section: IfcSectionSnapshot) => void,
    private readonly getPickOptions: () => PickOptions = () => ({}),
  ) {}

  get snapshot() {
    return this.state;
  }

  get bounds(): Bounds | null {
    const cameraBounds = this.renderer.getCamera().getSceneBounds();
    if (finiteBounds(cameraBounds)) {
      this.lastBounds = cameraBounds;
      return cameraBounds;
    }
    if (this.lastBounds) return this.lastBounds;
    const sceneBounds = this.renderer.getScene().getBounds();
    this.lastBounds = finiteBounds(sceneBounds) ? sceneBounds : null;
    return this.lastBounds;
  }

  get isPicking() {
    return this.state.pickMode !== null;
  }

  get renderOptions(): { sectionPlane?: SectionPlane; clipBox?: ClipBox } {
    if (this.state.active === "box" && this.state.box) {
      return { clipBox: { ...this.state.box, enabled: true } };
    }
    if (this.state.active !== "plane") return {};

    const plane = this.state.plane;
    return {
      sectionPlane: {
        axis: plane.axis,
        position: plane.position,
        enabled: true,
        flipped: plane.flipped,
        showCap: true,
        showOutlines: true,
        ...(plane.normal && plane.distance !== null
          ? { normal: plane.normal, distance: plane.distance }
          : {}),
      },
    };
  }

  captureBcfPlanes(): BCFClippingPlane[] {
    const toBcf = (p: Point) => ({ x: p.x, y: -p.z, z: p.y });
    if (this.state.active === "box" && this.state.box) {
      const { min, max } = this.state.box;
      return ([0, 1, 2] as const).flatMap((axis) =>
        [0, 1].map((side) => {
          const point = { x: 0, y: 0, z: 0 };
          const direction = { x: 0, y: 0, z: 0 };
          const key = (["x", "y", "z"] as const)[axis];
          point[key] = (side === 0 ? min : max)[axis];
          direction[key] = side === 0 ? 1 : -1;
          return { location: toBcf(point), direction: toBcf(direction) };
        }),
      );
    }
    if (this.state.active !== "plane") return [];
    const plane = this.state.plane;
    if (plane.normal && plane.distance !== null) {
      const [x, y, z] = plane.normal;
      const sign = plane.flipped ? 1 : -1;
      return [
        {
          location: toBcf({
            x: x * plane.distance,
            y: y * plane.distance,
            z: z * plane.distance,
          }),
          direction: toBcf({ x: x * sign, y: y * sign, z: z * sign }),
        },
      ];
    }
    const bounds = this.bounds;
    if (!bounds) return [];
    const result = sectionPlaneToClippingPlane(
      { ...plane, enabled: true },
      bounds,
    );
    return result ? [result] : [];
  }
  applyBcfPlanes(planes: BCFClippingPlane[]) {
    const fromBcf = (p: Point) => ({ x: p.x, y: p.z, z: -p.y });
    if (!planes.length) {
      this.reset();
      return;
    }
    if (planes.length === 1) {
      const p = planes[0]!;
      const direction = fromBcf(p.direction);
      const normal = normalized({
        x: -direction.x,
        y: -direction.y,
        z: -direction.z,
      });
      if (!normal) throw new Error("Le plan de coupe BCF est invalide.");
      this.activateCustomPlane("two-point", normal, fromBcf(p.location));
      return;
    }
    if (planes.length === 6) {
      const min: [number, number, number] = [-Infinity, -Infinity, -Infinity];
      const max: [number, number, number] = [Infinity, Infinity, Infinity];
      for (const plane of planes) {
        const p = fromBcf(plane.location);
        const n = fromBcf(plane.direction);
        const direction = [n.x, n.y, n.z];
        const axes = direction.flatMap((v, i) =>
          Math.abs(v) > 1e-6 ? [i] : [],
        );
        if (axes.length !== 1)
          throw new Error(
            "Cette vue contient plusieurs coupes obliques non prises en charge par le moteur. Sa capture reste disponible.",
          );
        const axis = axes[0] as AxisIndex;
        const value = [p.x, p.y, p.z][axis]!;
        if (direction[axis]! > 0) min[axis] = Math.max(min[axis], value);
        else max[axis] = Math.min(max[axis], value);
      }
      if (
        min.every(
          (v, i) =>
            Number.isFinite(v) && Number.isFinite(max[i]) && v < max[i]!,
        )
      ) {
        this.invalidatePick();
        this.commit({
          ...createEmptySectionSnapshot(),
          active: "box",
          box: { min, max },
        });
        return;
      }
    }
    throw new Error(
      "Cette vue contient une combinaison de coupes non prise en charge par le moteur. Sa capture reste disponible.",
    );
  }

  setAxis(axis: SectionPlaneAxis) {
    this.invalidatePick();
    this.commit({
      ...this.state,
      active: "plane",
      plane: {
        ...this.state.plane,
        source: "axis",
        axis,
        normal: null,
        distance: null,
        pickedAt: null,
      },
      pickMode: null,
      draftPoint: null,
      trace: null,
      message: null,
    });
  }

  setPosition(position: number) {
    if (!Number.isFinite(position) || this.state.plane.source !== "axis")
      return;
    this.commit({
      ...this.state,
      active: "plane",
      plane: {
        ...this.state.plane,
        position: Math.min(100, Math.max(0, position)),
      },
    });
  }

  setCustomDistance(distance: number) {
    if (
      !Number.isFinite(distance) ||
      this.state.plane.source === "axis" ||
      !this.state.plane.normal ||
      !this.state.plane.pickedAt
    ) {
      return;
    }
    this.invalidatePick();
    this.commit({
      ...this.state,
      active: "plane",
      plane: { ...this.state.plane, distance },
      pickMode: null,
      draftPoint: null,
    });
  }

  setFlipped(flipped: boolean) {
    this.commit({
      ...this.state,
      plane: { ...this.state.plane, flipped },
    });
  }

  showPlane() {
    this.invalidatePick();
    this.commit({
      ...this.state,
      active: "plane",
      pickMode: null,
      draftPoint: null,
      message: null,
    });
  }

  hide() {
    this.invalidatePick();
    this.commit({
      ...this.state,
      active: null,
      pickMode: null,
      draftPoint: null,
      message: null,
    });
  }

  reset() {
    this.invalidatePick();
    this.commit(createEmptySectionSnapshot());
  }

  startPick(mode: "face" | "two-point") {
    if (this.isPicking) this.cancelPick();
    this.invalidatePick();
    this.activeBeforePick = this.state.active;
    this.commit({
      ...this.state,
      active: null,
      pickMode: mode,
      draftPoint: null,
      message: null,
    });
  }

  cancelPick() {
    if (!this.isPicking) return;
    this.invalidatePick();
    this.commit({
      ...this.state,
      active: this.activeBeforePick,
      pickMode: null,
      draftPoint: null,
      message: null,
    });
  }

  pick(x: number, y: number) {
    const mode = this.state.pickMode;
    if (!mode) return false;
    if (this.pickPending) return true;

    const options = this.getPickOptions();
    const hit = this.renderer.raycastScene(x, y, options);
    if (!hit) {
      void this.pickFromGpu(x, y, mode, options);
      return true;
    }

    if (mode === "face") {
      const pickedNormal = normalized(hit.intersection.normal);
      const camera = this.renderer.getCamera().getPosition();
      const point = hit.intersection.point;
      const facing = pickedNormal
        ? pickedNormal[0] * (camera.x - point.x) +
          pickedNormal[1] * (camera.y - point.y) +
          pickedNormal[2] * (camera.z - point.z)
        : 0;
      const normal =
        pickedNormal && facing < 0
          ? (pickedNormal.map((component) =>
              component === 0 ? 0 : -component,
            ) as [number, number, number])
          : pickedNormal;
      if (!normal) {
        this.commit({
          ...this.state,
          message: "Cette face ne permet pas de définir un plan.",
        });
        return true;
      }
      this.activateCustomPlane("face", normal, point);
      return true;
    }

    this.acceptPoint(hit.intersection.point);
    return true;
  }

  private async pickFromGpu(
    x: number,
    y: number,
    mode: "face" | "two-point",
    options: PickOptions,
  ) {
    const revision = this.pickRevision;
    this.pickPending = true;
    try {
      const hit = await this.renderer.pick(x, y, options);
      if (revision !== this.pickRevision || this.state.pickMode !== mode)
        return;
      if (!hit?.worldXYZ) {
        this.commit({
          ...this.state,
          message: "Aucune surface à cet endroit. Réessayez dans la maquette.",
        });
      } else if (mode === "face") {
        this.commit({
          ...this.state,
          message:
            "Face précise indisponible sur cette maquette optimisée. Utilisez la coupe par deux points.",
        });
      } else {
        this.acceptPoint(hit.worldXYZ);
      }
    } catch {
      if (revision === this.pickRevision) {
        this.commit({
          ...this.state,
          message: "La sélection n’a pas abouti. Réessayez dans la maquette.",
        });
      }
    } finally {
      if (revision === this.pickRevision) this.pickPending = false;
    }
  }

  private acceptPoint(point: Point) {
    const firstPoint = this.state.draftPoint;
    if (!firstPoint) {
      this.commit({
        ...this.state,
        draftPoint: [point.x, point.y, point.z],
        message: null,
      });
      return;
    }

    const delta = {
      x: point.x - firstPoint[0],
      y: 0,
      z: point.z - firstPoint[2],
    };
    const normal = normalized({ x: delta.z, y: 0, z: -delta.x });
    if (!normal) {
      this.commit({
        ...this.state,
        draftPoint: null,
        message:
          "Les deux points doivent être distincts dans le plan horizontal.",
      });
      return;
    }
    this.activateCustomPlane(
      "two-point",
      normal,
      { x: firstPoint[0], y: firstPoint[1], z: firstPoint[2] },
      point,
    );
  }

  showBox() {
    if (!this.state.box) return this.fitBox();
    this.invalidatePick();
    this.commit({
      ...this.state,
      active: "box",
      pickMode: null,
      draftPoint: null,
      message: null,
    });
    return true;
  }

  fitBox() {
    const bounds = this.bounds;
    if (!bounds) return false;
    this.invalidatePick();
    const min = [bounds.min.x, bounds.min.y, bounds.min.z] as const;
    const max = [bounds.max.x, bounds.max.y, bounds.max.z] as const;
    const inset = min.map((value, axis) => (max[axis] - value) * 0.08);
    const box: IfcSectionSnapshot["box"] = {
      min: [min[0] + inset[0], min[1] + inset[1], min[2] + inset[2]],
      max: [max[0] - inset[0], max[1] - inset[1], max[2] - inset[2]],
    };
    if (
      box.min.some((value, axis) => box.max[axis] - value < minBoxThickness)
    ) {
      return false;
    }
    this.commit({
      ...this.state,
      active: "box",
      box,
      pickMode: null,
      draftPoint: null,
      message: null,
    });
    return true;
  }

  moveBoxFace(axis: AxisIndex, side: "min" | "max", value: number) {
    const box = this.state.box;
    const bounds = this.bounds;
    if (!box || !bounds || !Number.isFinite(value)) return;
    const limitMin = [bounds.min.x, bounds.min.y, bounds.min.z][axis];
    const limitMax = [bounds.max.x, bounds.max.y, bounds.max.z][axis];
    const min: [number, number, number] = [...box.min];
    const max: [number, number, number] = [...box.max];
    if (side === "min") {
      min[axis] = Math.min(
        max[axis] - minBoxThickness,
        Math.max(limitMin, value),
      );
    } else {
      max[axis] = Math.max(
        min[axis] + minBoxThickness,
        Math.min(limitMax, value),
      );
    }
    this.commit({ ...this.state, active: "box", box: { min, max } });
  }

  private activateCustomPlane(
    source: "face" | "two-point",
    normal: [number, number, number],
    point: Point,
    endPoint?: Point,
  ) {
    const coordinateScale = Math.max(
      Math.abs(point.x),
      Math.abs(point.y),
      Math.abs(point.z),
    );
    const inset =
      source === "face"
        ? Math.min(0.05, Math.max(2 * QUANT_STEP, coordinateScale / 65_536))
        : 0;
    this.commit({
      ...this.state,
      active: "plane",
      plane: {
        ...this.state.plane,
        source,
        normal,
        distance: planeAtPoint(normal, point) - inset,
        pickedAt: [point.x, point.y, point.z],
        flipped: false,
      },
      pickMode: null,
      draftPoint: null,
      trace: endPoint
        ? {
            start: [point.x, point.y, point.z],
            end: [endPoint.x, endPoint.y, endPoint.z],
          }
        : null,
      message: null,
    });
  }

  private commit(next: IfcSectionSnapshot) {
    this.state = next;
    this.onChange(next);
    this.renderer.requestRender();
  }

  private invalidatePick() {
    this.pickRevision += 1;
    this.pickPending = false;
  }
}
