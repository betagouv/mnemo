"use client";

import { useRef, useState } from "react";
import {
  type ViewerPanelId,
  type ViewerToolGroupId,
} from "../model/viewer-tool-catalog";
import type { IfcViewerController } from "@mnemo/ifc-viewer-adapter";

export function useViewerPanels(
  getViewer: () => Pick<IfcViewerController, "cancelSectionPick"> | null,
) {
  const [activePanel, setActivePanel] = useState<ViewerPanelId | null>(
    "layers",
  );
  const [activeToolGroup, setActiveToolGroup] =
    useState<ViewerToolGroupId | null>("layers");
  const [explorerPinned, setExplorerPinned] = useState(false);
  const [panelFocusRequest, setPanelFocusRequest] = useState(0);

  const toolBarRef = useRef<HTMLDivElement>(null);
  const lastPanelTrigger = useRef<HTMLButtonElement | null>(null);

  const openPanel = (
    panel: ViewerPanelId,
    groupId: ViewerToolGroupId,
    trigger?: HTMLButtonElement,
  ) => {
    if (
      (activePanel === "cut-plane" || activePanel === "cut-box") &&
      panel !== activePanel
    ) {
      getViewer()?.cancelSectionPick();
    }
    lastPanelTrigger.current =
      trigger ??
      toolBarRef.current?.querySelector<HTMLButtonElement>(
        `button[data-tool-group="${groupId}"]`,
      ) ??
      null;
    setActivePanel(panel);
    setActiveToolGroup(groupId);
    setPanelFocusRequest((request) => request + 1);
  };

  const closePanel = () => {
    getViewer()?.cancelSectionPick();
    setActivePanel(null);
    setActiveToolGroup(null);
    setPanelFocusRequest(0);
    const returnTarget =
      (lastPanelTrigger.current?.isConnected
        ? lastPanelTrigger.current
        : null) ?? toolBarRef.current?.querySelector("button");
    returnTarget?.focus();
  };
  const togglePanel = (
    panel: ViewerPanelId,
    groupId: ViewerToolGroupId,
    trigger: HTMLButtonElement,
  ) => {
    if (activeToolGroup === groupId && activePanel !== null) closePanel();
    else openPanel(panel, groupId, trigger);
  };
  return {
    activePanel,
    setActivePanel,
    explorerPinned,
    setExplorerPinned,
    activeToolGroup,
    setActiveToolGroup,
    panelFocusRequest,
    setPanelFocusRequest,
    toolBarRef,
    openPanel,
    togglePanel,
    closePanel,
  };
}
