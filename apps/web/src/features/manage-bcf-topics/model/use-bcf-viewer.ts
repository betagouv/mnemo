"use client";

import type {
  BcfTopicSummary,
  BcfMarkerTopic,
  CreateBcfTopicInput,
} from "@mnemo/contracts/bcf";
import { useCallback, useRef, useState } from "react";
import type { BcfViewer } from "./viewer-target";

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
  const bcfPanelRef = useRef<{
    open: (id: string) => Promise<void>;
    create: () => void;
  }>(null);
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
  };
}
