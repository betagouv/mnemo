export type BcfViewpointSnapshotKeyInput = {
  projectId: string;
  topicId: string;
  viewpointId: string;
  mediaType: "image/png" | "image/jpeg";
};

export function buildBcfViewpointSnapshotKey({
  projectId,
  topicId,
  viewpointId,
  mediaType,
}: BcfViewpointSnapshotKeyInput) {
  const extension = mediaType === "image/jpeg" ? "jpg" : "png";
  return `projects/${projectId}/bcf/${topicId}/viewpoints/${viewpointId}/snapshot.${extension}`;
}
