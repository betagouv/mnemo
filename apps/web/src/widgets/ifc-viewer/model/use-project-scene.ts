import { usePointCloudLayers } from "@/features/configure-point-cloud";
import {
  createEmptyViewerSnapshot,
  IfcViewerController,
} from "@mnemo/ifc-viewer-adapter";
import type { ProjectMapReference } from "@mnemo/contracts/map-reference";
import { openAssetResultSchema } from "@mnemo/contracts/assets";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/shared/lib/fetch-json";
import { pinProjectMapReference } from "@/server/ifc/actions";
import { useNotifications } from "@/shared/ui/notifications";
import {
  summarizeModelWarnings,
  type ViewerIfcSource,
  type ViewerPointCloudSource,
} from "@/entities/viewer";

function loadIfcSource(
  controller: IfcViewerController,
  projectId: string,
  source: ViewerIfcSource,
) {
  return controller.loadIfc({
    assetId: source.assetId,
    fileName: source.fileName,
    downloadUrl: async () => {
      const { downloadUrl } = await fetchJson(
        `/api/projects/${projectId}/assets/${source.assetId}/access`,
        openAssetResultSchema,
      );
      return downloadUrl;
    },
    processing: source.processing,
  });
}

export function useProjectScene({
  ifcSources,
  mapReference,
  pointCloudSources,
  projectId,
}: {
  ifcSources: ViewerIfcSource[];
  mapReference: ProjectMapReference | null;
  pointCloudSources: ViewerPointCloudSource[];
  projectId: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<IfcViewerController>(null);
  const [snapshot, setSnapshot] = useState(createEmptyViewerSnapshot);
  const { notify } = useNotifications();
  const [retrying, setRetrying] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [failedAssetId, setFailedAssetId] = useState<string | null>(null);
  const ifcSourcesRef = useRef(ifcSources);
  const mapReferenceRef = useRef(mapReference);
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

    const controller = new IfcViewerController(canvas, undefined, {
      reference: mapReferenceRef.current,
      pin: (reference) => pinProjectMapReference({ projectId, reference }),
    });
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

  const modelWarnings = summarizeModelWarnings(snapshot.models);
  useEffect(() => {
    if (modelWarnings)
      notify({
        id: `ifc-models:${projectId}`,
        title: "Maquettes à vérifier",
        description: modelWarnings,
        severity: "warning",
      });
  }, [notify, modelWarnings, projectId]);

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
