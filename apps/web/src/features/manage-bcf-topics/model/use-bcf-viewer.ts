"use client";

import type {
  BcfTopicSummary,
  BcfMarkerTopic,
  CreateBcfTopicInput,
} from "@mnemo/contracts/bcf";
import { useCallback, useRef, useState } from "react";
import type { BcfViewer } from "./viewer-target";
import type { BcfWorkspaceHandle } from "./bcf-workspace-types";

export function useBcfViewer(
  getViewer: () => BcfViewer | null,
  enabled: boolean,
  initialBcfTopics: BcfTopicSummary[],
) {
  const [bcfTopicCount, setBcfTopicCount] = useState(initialBcfTopics.length);
  const [markerTopics, setMarkerTopics] = useState<BcfMarkerTopic[]>([]);
  const [activeBcfTopicId, setActiveBcfTopicId] = useState<string | null>(null);
  const captureBcf = useCallback(
    (objects?: CreateBcfTopicInput["components"]) => {
      const controller = getViewer();
      if (!controller)
        return Promise.reject(new Error("La visionneuse n’est pas prête."));
      return controller.captureBcfViewpoint(objects);
    },
    [getViewer],
  );
  const previewBcfObjects = useCallback(
    (objects: CreateBcfTopicInput["components"]) =>
      getViewer()?.setBcfSelection(enabled ? objects : []),
    [getViewer, enabled],
  );
  const queryBcfObjects = useCallback(
    () => getViewer()?.bcfObjects() ?? [],
    [getViewer],
  );
  const bcfPanelRef = useRef<BcfWorkspaceHandle>(null);
  const createBcfFromSelection = useCallback(() => {
    const viewer = getViewer();
    if (!viewer) return;
    const objects = viewer
      .getSnapshot()
      .selectedElements.flatMap((selected) => {
        const element = viewer.getBimElement(
          selected.assetId,
          selected.expressId,
        );
        return element?.globalId
          ? [
              {
                assetId: selected.assetId,
                expressId: selected.expressId,
                globalId: element.globalId,
                name: element.name || element.globalId,
              },
            ]
          : [];
      });
    bcfPanelRef.current?.create(objects);
  }, [getViewer]);
  return {
    bcfTopicCount,
    setBcfTopicCount,
    markerTopics,
    setMarkerTopics,
    activeBcfTopicId,
    setActiveBcfTopicId,
    captureBcf,
    previewBcfObjects,
    queryBcfObjects,
    bcfPanelRef,
    createBcfFromSelection,
  };
}
