"use client";

import type { CapturedBcfViewpoint } from "@mnemo/ifc-viewer-adapter";
import type { BcfViewpointDraft } from "@mnemo/contracts/bcf";
import { prepareBcfSnapshot } from "@/server/bcf/actions";

export async function uploadViewpoint(
  projectId: string,
  view: CapturedBcfViewpoint | null,
): Promise<BcfViewpointDraft | undefined> {
  if (!view) return;
  let uploadId: string | undefined;
  if (view.snapshot) {
    if (view.snapshot.size > 10 * 1024 * 1024)
      throw new Error(
        "La capture dépasse la limite de 10 Mio. Réduisez la taille de la fenêtre puis reprenez la capture.",
      );
    const mediaType = view.snapshot.type;
    if (mediaType !== "image/png" && mediaType !== "image/jpeg")
      throw new Error("Format de capture inconnu.");
    const upload = await prepareBcfSnapshot({
      projectId,
      mediaType,
      sizeBytes: view.snapshot.size,
    });
    const response = await fetch(upload.uploadUrl, {
      method: "PUT",
      headers: upload.requiredHeaders,
      body: view.snapshot,
    });
    if (!response.ok)
      throw new Error("L’envoi de la capture a échoué. Réessayez.");
    uploadId = upload.uploadId;
  }
  return { data: view.data, targetDistance: view.targetDistance, uploadId };
}
