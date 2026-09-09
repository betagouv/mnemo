export type OriginalObjectKeyInput = {
  projectId: string;
  assetId: string;
  fileName: string;
};

function safeExtension(fileName: string) {
  const extension = fileName.trim().toLowerCase().split(".").pop();

  if (!extension || extension === fileName.toLowerCase()) {
    return "bin";
  }

  return extension.replaceAll(/[^a-z0-9]/g, "") || "bin";
}

export function buildOriginalObjectKey({
  projectId,
  assetId,
  fileName,
}: OriginalObjectKeyInput) {
  return `projects/${projectId}/assets/${assetId}/original.${safeExtension(fileName)}`;
}
