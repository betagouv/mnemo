export const pointCloudArtifactNames = [
  "metadata.json",
  "hierarchy.bin",
  "octree.bin",
] as const;

export type PointCloudArtifactName = (typeof pointCloudArtifactNames)[number];

export type PointCloudArtifactObjectKeyInput = {
  projectId: string;
  assetId: string;
  name: PointCloudArtifactName;
};

export function buildPointCloudArtifactObjectKey({
  projectId,
  assetId,
  name,
}: PointCloudArtifactObjectKeyInput) {
  return `projects/${projectId}/assets/${assetId}/derived/potree-v2/${name}`;
}
