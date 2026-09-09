import type { ProjectRole } from "./project";
import { hasProjectPermission } from "./project";

export const assetKinds = ["ifc", "point_cloud"] as const;
export type AssetKind = (typeof assetKinds)[number];

export const assetStatuses = [
  "upload_pending",
  "uploaded",
  "processing",
  "ready",
  "failed",
] as const;
export type AssetStatus = (typeof assetStatuses)[number];

const extensionsByKind = {
  ifc: new Set(["ifc", "ifczip"]),
  point_cloud: new Set(["las", "laz", "ply", "e57"]),
} satisfies Record<AssetKind, ReadonlySet<string>>;

export function getFileExtension(fileName: string) {
  const extension = fileName.trim().toLowerCase().split(".").pop();
  return extension && extension !== fileName.toLowerCase() ? extension : null;
}

export function supportsAssetFile(kind: AssetKind, fileName: string) {
  const extension = getFileExtension(fileName);
  return extension ? extensionsByKind[kind].has(extension) : false;
}

export function canUploadAsset(role: ProjectRole) {
  return hasProjectPermission(role, "asset:create");
}
