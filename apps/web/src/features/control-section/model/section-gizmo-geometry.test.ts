import type { IfcSectionSnapshot } from "@mnemo/ifc-viewer-adapter";
import { describe, expect, it } from "vitest";

import {
  draggedSectionDistance,
  projectSectionGizmo,
  sectionPlaneCorners,
  sectionGizmoAxis,
} from "./section-gizmo-geometry";

const plane: IfcSectionSnapshot["plane"] = {
  source: "face",
  axis: "side",
  position: 50,
  flipped: false,
  normal: [1, 0, 0],
  distance: 10,
  pickedAt: [10, 2, 3],
};

describe("projectSectionGizmo", () => {
  it("colors oblique planes by their dominant normal axis", () => {
    expect(sectionGizmoAxis({ ...plane, normal: [-0.9, 0.3, 0.1] })).toBe("x");
    expect(sectionGizmoAxis({ ...plane, normal: [0.1, -0.9, 0.3] })).toBe("y");
    expect(sectionGizmoAxis({ ...plane, normal: [0.1, 0.3, -0.9] })).toBe("z");
  });

  it("keeps the handle on the live plane after a distance change", () => {
    const project = (point: { x: number; y: number }) => ({
      x: point.x * 2,
      y: point.y * 2,
    });
    expect(projectSectionGizmo(plane, null, project)?.foot).toEqual({
      x: 20,
      y: 4,
    });
    expect(
      projectSectionGizmo({ ...plane, distance: 15 }, null, project),
    ).toMatchObject({
      foot: { x: 30, y: 4 },
      screenNormal: { x: 1, y: 0 },
      pixelsPerMeter: 2,
    });
  });

  it("refuses to drag an edge-on normal or a hidden anchor", () => {
    const edgeOn = projectSectionGizmo(plane, null, (point) => ({
      x: 2,
      y: point.y,
    }));
    expect(edgeOn?.screenNormal).toBeNull();
    expect(projectSectionGizmo(plane, null, () => null)).toBeNull();
  });

  it("converts pointer motion along the projected normal into metres", () => {
    expect(
      draggedSectionDistance(10, { x: 30, y: 40 }, { x: 1, y: 0 }, 2),
    ).toBe(25);
    expect(draggedSectionDistance(10, { x: 0, y: 40 }, { x: 1, y: 0 }, 2)).toBe(
      10,
    );
    expect(
      draggedSectionDistance(10, { x: 30, y: 0 }, { x: 1, y: 0 }, 0),
    ).toBeNull();
  });

  it("projects preset planes from scene bounds instead of requiring a picked face", () => {
    const bounds = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 10, y: 20, z: 30 },
    };
    const preset = {
      ...plane,
      source: "axis" as const,
      axis: "down" as const,
      position: 25,
      normal: null,
      pickedAt: null,
      distance: null,
    };
    expect(
      projectSectionGizmo(preset, bounds, (point) => ({
        x: point.y * 2,
        y: point.z,
      }))?.foot,
    ).toEqual({ x: 10, y: 15 });
    expect(
      projectSectionGizmo(preset, bounds, (point) => ({
        x: point.y * 2,
        y: point.z,
      }))?.span,
    ).toBe(20);
    expect(sectionPlaneCorners(preset, bounds)).toEqual([
      { x: 0, y: 5, z: 0 },
      { x: 10, y: 5, z: 0 },
      { x: 10, y: 5, z: 30 },
      { x: 0, y: 5, z: 30 },
    ]);
  });
});
