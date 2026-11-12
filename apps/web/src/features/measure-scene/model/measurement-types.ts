import type { Point3, MeasurementKind } from "@mnemo/domain/measurement";
export type SceneMeasurement = {
  id: string;
  kind: MeasurementKind;
  points: Point3[];
  value: number;
};
