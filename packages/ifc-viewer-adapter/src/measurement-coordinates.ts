type Point3 = { x: number; y: number; z: number };
/** Renderer uses local Y-up; persisted IFC coordinates use absolute Z-up metres. */
export function measurementToProject(point: Point3, origin: Point3): Point3 {
  return {
    x: point.x + origin.x,
    y: origin.y - point.z,
    z: point.y + origin.z,
  };
}
export function measurementFromProject(point: Point3, origin: Point3): Point3 {
  return {
    x: point.x - origin.x,
    y: point.z - origin.z,
    z: origin.y - point.y,
  };
}
