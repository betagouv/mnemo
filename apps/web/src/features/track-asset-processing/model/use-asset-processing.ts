"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { assetListSchema, type AssetSummary } from "@mnemo/contracts/assets";

export function useAssetProcessing(
  projectId: string,
  pendingIds: string,
  onUpdate: (assets: AssetSummary[], watchedIds: string[]) => void,
) {
  const [error, setError] = useState<string | null>(null);
  const applyUpdate = useEffectEvent(onUpdate);

  useEffect(() => {
    if (!pendingIds) return;
    const watchedIds = pendingIds.split(",");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    async function poll() {
      try {
        if (document.visibilityState === "hidden") return;
        const response = await fetch(
          `/api/projects/${encodeURIComponent(projectId)}/assets`,
          {
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(15_000),
            ]),
          },
        );
        if (response.status === 401 || response.status === 404) {
          stopped = true;
          setError("Le suivi n'est plus accessible. Rechargez la page.");
          return;
        }
        if (!response.ok) throw new Error("Asset status unavailable");
        const assets = assetListSchema.parse(await response.json());
        if (controller.signal.aborted) return;
        setError(null);
        applyUpdate(assets, watchedIds);
      } catch {
        if (!controller.signal.aborted)
          setError(
            "Le suivi est momentanément indisponible. Actualisation automatique en cours.",
          );
      } finally {
        if (!controller.signal.aborted && !stopped)
          timer = setTimeout(poll, 5_000);
      }
    }
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [projectId, pendingIds]);
  return pendingIds ? error : null;
}
