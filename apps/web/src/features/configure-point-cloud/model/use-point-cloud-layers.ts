"use client";

import { type LoadPointCloudInput } from "@mnemo/ifc-viewer-adapter";
import { pointCloudSourceSchema } from "@mnemo/contracts/point-clouds";
import { useCallback, useRef, useState } from "react";
import { fetchJson } from "@/shared/lib/fetch-json";
import { useNotifications } from "@/shared/ui/notifications";
import type { PointCloudConfiguration } from "./point-cloud-configuration";
import type { PointCloudViewer } from "./viewer-target";
import type { ViewerPointCloudSource } from "@/entities/viewer";

const initialPointBudget = 2_000_000;

export function usePointCloudLayers(
  projectId: string,
  pointCloudSources: ViewerPointCloudSource[],
  getViewer: () => PointCloudViewer | null,
) {
  const { notify } = useNotifications();
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

  const pointCloudSourcesRef = useRef(pointCloudSources);
  const loadPointCloud = useCallback(
    async (
      controller: PointCloudViewer,
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

  function updatePointCloudConfiguration(
    configuration: PointCloudConfiguration,
  ) {
    setPointCloudConfigurations((current) =>
      current.map((item) =>
        item.assetId === configuration.assetId ? configuration : item,
      ),
    );
    getViewer()?.setPointCloudTransform(
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
    controller: PointCloudViewer,
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
    const controller = getViewer();
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
    const controller = getViewer();
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

  const loadInitial = useCallback(
    async (controller: PointCloudViewer) => {
      await Promise.allSettled(
        pointCloudSourcesRef.current
          .filter(
            (source) => !hiddenPointCloudIdsRef.current.has(source.assetId),
          )
          .map((source) =>
            loadPointCloud(controller, source, pointBudgetRef.current),
          ),
      );
    },
    [loadPointCloud],
  );
  return {
    pointBudget,
    hiddenPointCloudIds,
    pointCloudConfigurations,
    updatePointCloudConfiguration,
    setPointCloudVisible,
    reloadPointClouds,
    loadInitial,
  };
}
