import type { IfcSectionSnapshot } from "@mnemo/ifc-viewer-adapter";

type Box = NonNullable<IfcSectionSnapshot["box"]>;
type Point = { x: number; y: number; z: number };
export type Face = {
  axis: 0 | 1 | 2;
  side: "min" | "max";
  value: number;
  sign: -1 | 1;
  center: Point;
  tip: Point;
  corners: [Point, Point, Point, Point];
};

const coordinates = ["x", "y", "z"] as const;

export function sectionBoxFaces(box: Box): Face[] {
  const faces: Face[] = [];
  for (const axis of [0, 1, 2] as const) {
    const [otherA, otherB] = ([0, 1, 2] as const).filter(
      (index) => index !== axis,
    );
    for (const side of ["min", "max"] as const) {
      const sign = side === "min" ? -1 : 1;
      const value = box[side][axis];
      const centerValues = box.min.map(
        (min, index) => (min + box.max[index]) / 2,
      );
      centerValues[axis] = value;
      const center = {
        x: centerValues[0],
        y: centerValues[1],
        z: centerValues[2],
      };
      const tip = { ...center };
      tip[coordinates[axis]] += sign;
      const corners = (
        [
          ["min", "min"],
          ["max", "min"],
          ["max", "max"],
          ["min", "max"],
        ] as const
      ).map(([a, b]) => {
        const values = [...centerValues];
        values[otherA] = box[a][otherA];
        values[otherB] = box[b][otherB];
        return { x: values[0], y: values[1], z: values[2] };
      }) as Face["corners"];
      faces.push({ axis, side, value, sign, center, tip, corners });
    }
  }
  return faces;
}

export function draggedBoxFaceValue(
  startValue: number,
  sign: -1 | 1,
  delta: { x: number; y: number },
  screenNormal: { x: number; y: number },
  pixelsPerMeter: number,
) {
  if (!Number.isFinite(pixelsPerMeter) || pixelsPerMeter < 1e-3) return null;
  const along = delta.x * screenNormal.x + delta.y * screenNormal.y;
  const value = startValue + (sign * along) / pixelsPerMeter;
  return Number.isFinite(value) ? value : null;
}
