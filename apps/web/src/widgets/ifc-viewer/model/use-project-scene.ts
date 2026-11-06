import { usePointCloudLayers } from "@/features/configure-point-cloud";
import {
  createEmptyViewerSnapshot,
  IfcViewerController,
} from "@mnemo/ifc-viewer-adapter";
import { openAssetResultSchema } from "@mnemo/contracts/assets";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/shared/lib/fetch-json";
import { useNotifications } from "@/shared/ui/notifications";
import type {
  ViewerIfcSource,
  ViewerPointCloudSource,
} from "@/entities/viewer";

async function loadIfcSource(
  controller: IfcViewerController,
  projectId: string,
  source: ViewerIfcSource,
) {
  const downloadUrl =
    source.processing.engine === "rust"
      ? ""
      : (
          await fetchJson(
            `/api/projects/${projectId}/assets/${source.assetId}/access`,
            openAssetResultSchema,
          )
        ).downloadUrl;
  await controller.loadIfc({
    assetId: source.assetId,
    fileName: source.fileName,
    downloadUrl,
    processing: source.processing,
  });
}

export function useProjectScene({
  ifcSources,
  pointCloudSources,
  projectId,
}: {
  ifcSources: ViewerIfcSource[];
  pointCloudSources: ViewerPointCloudSource[];
  projectId: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<IfcViewerController>(null);
  const [snapshot, setSnapshot] = useState(createEmptyViewerSnapshot);
  const { notify } = useNotifications();
  const notifiedGeoreferencing = useRef(new Set<string>());
  const [retrying, setRetrying] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [failedAssetId, setFailedAssetId] = useState<string | null>(null);
  const ifcSourcesRef = useRef(ifcSources);
  const getViewer = useCallback(() => controllerRef.current, []);

  const { loadInitial, ...clouds } = usePointCloudLayers(
    projectId,
    pointCloudSources,
    getViewer,
  );
  const initialLoadPointCloudRef = useRef(loadInitial);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const controller = new IfcViewerController(canvas);
    let cancelled = false;
    controllerRef.current = controller;
    const syncBackground = () => {
      controller.setBackgroundColor(
        document.documentElement.dataset.frTheme === "dark"
          ? [0.12, 0.12, 0.12, 1]
          : [0.97, 0.97, 0.985, 1],
      );
    };
    syncBackground();
    const themeObserver = new MutationObserver(syncBackground);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-fr-theme"],
    });
    const unsubscribe = controller.subscribe(setSnapshot);
    void (async () => {
      try {
        await controller.init();
        if (cancelled) return;
        for (const source of ifcSourcesRef.current) {
          if (cancelled) return;
          try {
            await loadIfcSource(controller, projectId, source);
          } catch (error) {
            if (!cancelled) {
              setFailedAssetId(source.assetId);
              setAccessError(
                `${source.fileName} : ${error instanceof Error ? error.message : "chargement impossible"}. Les autres couches restent disponibles.`,
              );
            }
          }
        }
        if (cancelled) return;
        await initialLoadPointCloudRef.current(controller);
        if (!cancelled) controller.fitToView();
      } catch {
        if (!cancelled) {
          setAccessError("La scène du projet n’a pas pu être initialisée.");
        }
      }
    })();

    return () => {
      cancelled = true;
      themeObserver.disconnect();
      unsubscribe();
      controller.dispose();
      controllerRef.current = null;
    };
  }, [projectId]);

  useEffect(() => {
    for (const model of snapshot.models) {
      if (
        model.phase !== "ready" ||
        notifiedGeoreferencing.current.has(model.assetId)
      )
        continue;
      notifiedGeoreferencing.current.add(model.assetId);
      const status = model.georeferencing;
      notify({
        id: `ifc-georeferencing:${projectId}:${model.assetId}`,
        title: "Positionnement IFC à vérifier",
        description: `${model.fileName} — ${
          status?.kind === "projected"
            ? `CRS ${status.crs ?? "déclaré"} détecté. L’alignement cartographique automatique n’est pas encore appliqué.`
            : status?.kind === "site-only"
              ? "Coordonnées de site seules : alignement automatique impossible. Vérifiez la superposition des fichiers."
              : "Repère local : aucun géoréférencement IFC exploitable. Vérifiez la superposition des fichiers."
        }`,
        severity: "warning",
      });
    }
  }, [notify, projectId, snapshot.models]);

  const retry = useCallback(
    async (source: ViewerIfcSource) => {
      const controller = controllerRef.current;
      if (!controller) return;

      setRetrying(true);
      setAccessError(null);
      setFailedAssetId(null);

      try {
        await loadIfcSource(controller, projectId, source);
      } catch (error) {
        setFailedAssetId(source.assetId);
        setAccessError(
          `${source.fileName} : ${error instanceof Error ? error.message : "chargement impossible"}.`,
        );
      } finally {
        setRetrying(false);
      }
    },
    [projectId],
  );

  return {
    canvasRef,
    controllerRef,
    snapshot,
    getViewer,
    retrying,
    accessError,
    failedAssetId,
    ...clouds,
    retry,
  };
}
