import {
  createEmptyViewerSnapshot,
  IfcViewerController,
  type LoadPointCloudInput,
} from "@mnemo/ifc-viewer-adapter";
import { openAssetResultSchema } from "@mnemo/contracts/assets";
import { pointCloudSourceSchema } from "@mnemo/contracts/point-clouds";
import { useCallback, useEffect, useRef, useState } from "react";

import type { PointCloudConfiguration } from "@/features/configure-point-cloud";
import { fetchJson } from "@/shared/lib/fetch-json";
import { useNotifications } from "@/shared/ui/notifications";

import type { ViewerIfcSource, ViewerPointCloudSource } from "./viewer-sources";

const initialPointBudget = 2_000_000;

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
  const [pointBudget, setPointBudget] = useState(initialPointBudget);
  const pointBudgetRef = useRef(initialPointBudget);
  const [hiddenPointCloudIds, setHiddenPointCloudIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const hiddenPointCloudIdsRef = useRef(new Set<string>());
  const pointCloudLoadGeneration = useRef(new Map<string, number>());
  const [pointCloudConfigurations, setPointCloudConfigurations] = useState<
    PointCloudConfiguration[]
  >(() =>
    pointCloudSources.map((source) => ({
      assetId: source.assetId,
      fileName: source.fileName,
      transform: source.settings.transform,
      sourceCrs: source.settings.sourceCrs,
      targetCrs: source.settings.targetCrs,
    })),
  );
  const ifcSourcesRef = useRef(ifcSources);
  const pointCloudSourcesRef = useRef(pointCloudSources);
  const getViewer = useCallback(() => controllerRef.current, []);

  const loadPointCloud = useCallback(
    async (
      controller: IfcViewerController,
      source: ViewerPointCloudSource,
      maxPointsInMemory: number,
      transform = source.settings.transform,
    ) => {
      const base = {
        assetId: source.assetId,
        fileName: source.fileName,
        maxPointsInMemory,
        transform,
      };
      let input: LoadPointCloudInput;
      if (source.source.mode === "preview") {
        input = {
          ...base,
          source: {
            mode: "preview",
            downloadUrl: source.source.downloadUrl,
          },
        };
      } else {
        input = {
          ...base,
          source: {
            mode: "copc",
            access: source.source,
            refreshAccess: async () => {
              const refreshed = await fetchJson(
                `/api/projects/${projectId}/assets/${source.assetId}/point-cloud/source`,
                pointCloudSourceSchema,
              );
              if (refreshed.mode !== "copc") {
                throw new Error(
                  "Le COPC du nuage de points n’est plus disponible.",
                );
              }
              return refreshed;
            },
          },
        };
      }
      await controller.loadPointCloud(input);
    },
    [projectId],
  );
  const initialLoadPointCloudRef = useRef(loadPointCloud);

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
        await Promise.allSettled(
          pointCloudSourcesRef.current
            .filter(
              (source) => !hiddenPointCloudIdsRef.current.has(source.assetId),
            )
            .map((source) =>
              initialLoadPointCloudRef.current(
                controller,
                source,
                initialPointBudget,
              ),
            ),
        );
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

  function updatePointCloudConfiguration(
    configuration: PointCloudConfiguration,
  ) {
    setPointCloudConfigurations((current) =>
      current.map((item) =>
        item.assetId === configuration.assetId ? configuration : item,
      ),
    );
    controllerRef.current?.setPointCloudTransform(
      configuration.assetId,
      configuration.transform,
    );
  }

  function nextPointCloudGeneration(assetId: string) {
    const generation = (pointCloudLoadGeneration.current.get(assetId) ?? 0) + 1;
    pointCloudLoadGeneration.current.set(assetId, generation);
    return generation;
  }

  async function reopenPointCloud(
    controller: IfcViewerController,
    source: ViewerPointCloudSource,
    generation: number,
  ) {
    try {
      const access = await fetchJson(
        `/api/projects/${projectId}/assets/${source.assetId}/point-cloud/source`,
        pointCloudSourceSchema,
      );
      if (
        hiddenPointCloudIdsRef.current.has(source.assetId) ||
        pointCloudLoadGeneration.current.get(source.assetId) !== generation
      )
        return;

      const refreshed = { ...source, source: access };
      pointCloudSourcesRef.current = pointCloudSourcesRef.current.map(
        (current) =>
          current.assetId === refreshed.assetId ? refreshed : current,
      );
      const configuration = pointCloudConfigurations.find(
        (item) => item.assetId === source.assetId,
      );
      await loadPointCloud(
        controller,
        refreshed,
        pointBudgetRef.current,
        configuration?.transform ?? source.settings.transform,
      );
    } catch (error) {
      if (
        hiddenPointCloudIdsRef.current.has(source.assetId) ||
        pointCloudLoadGeneration.current.get(source.assetId) !== generation
      )
        return;
      notify({
        id: `point-cloud:${source.assetId}:load-error`,
        title: "Relevé 3D indisponible",
        description: `${source.fileName} — ${error instanceof Error ? error.message : "chargement impossible"}`,
        severity: "error",
      });
    }
  }

  function setPointCloudVisible(assetId: string, visible: boolean) {
    const controller = controllerRef.current;
    if (!controller) return;
    const nextHidden = new Set(hiddenPointCloudIdsRef.current);
    if (visible) nextHidden.delete(assetId);
    else nextHidden.add(assetId);
    hiddenPointCloudIdsRef.current = nextHidden;
    setHiddenPointCloudIds(nextHidden);
    const generation = nextPointCloudGeneration(assetId);

    if (!visible) {
      controller.removePointCloud(assetId);
      return;
    }
    const source = pointCloudSourcesRef.current.find(
      (item) => item.assetId === assetId,
    );
    if (source) void reopenPointCloud(controller, source, generation);
  }

  async function reloadPointClouds(maxPointsInMemory: number) {
    const controller = controllerRef.current;
    if (!controller) return;

    pointBudgetRef.current = maxPointsInMemory;
    setPointBudget(maxPointsInMemory);
    controller.setPointCloudPointBudget(maxPointsInMemory);
    await Promise.allSettled(
      pointCloudSourcesRef.current.map(async (source) => {
        if (
          source.source.mode === "copc" ||
          hiddenPointCloudIdsRef.current.has(source.assetId)
        )
          return;
        await reopenPointCloud(
          controller,
          source,
          nextPointCloudGeneration(source.assetId),
        );
      }),
    );
  }

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
    pointBudget,
    hiddenPointCloudIds,
    pointCloudConfigurations,
    updatePointCloudConfiguration,
    setPointCloudVisible,
    reloadPointClouds,
    retry,
  };
}
