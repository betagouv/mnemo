"use client";

import { StoreyTree } from "./storey-tree";
import type { BimViewer } from "../model/viewer-target";
import {
  type BimLayerTarget,
  type IfcElementSummary,
  type IfcViewerSnapshot,
} from "@mnemo/ifc-viewer-adapter";
import { useMemo, type ComponentProps } from "react";
import { VisibilityCheckbox } from "@/shared/ui/visibility-checkbox";
import { InlineDisclosure } from "@/shared/ui/inline-disclosure";
import { useSelectionExpansion } from "../model/use-selection-expansion";
import styles from "./bim-layer-tree.module.css";
import { BimExplorer } from "./bim-explorer";

type IfcLayer = { assetId: string; fileName: string };

function hexToRgba(hex: string): [number, number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
    1,
  ];
}

function ModelDisclosure({
  selection,
  defaultExpanded,
  ...props
}: ComponentProps<typeof InlineDisclosure> & {
  selection: IfcElementSummary | null;
}) {
  const [expanded, setExpanded] = useSelectionExpansion(
    selection,
    defaultExpanded,
  );
  return (
    <InlineDisclosure
      {...props}
      expanded={expanded}
      onExpandedChange={setExpanded}
    />
  );
}

export function BimLayerTree({
  snapshot,
  ifcSources,
  getViewer,
}: {
  snapshot: IfcViewerSnapshot;
  ifcSources: IfcLayer[];
  getViewer: () => BimViewer | null;
}) {
  const selection = useMemo(
    () =>
      snapshot.selection && snapshot.activeModelId
        ? (getViewer()?.getBimElement(
            snapshot.activeModelId,
            snapshot.selection.expressId,
          ) ?? null)
        : null,
    [snapshot.selection, snapshot.activeModelId, getViewer],
  );

  const selectedByModel = useMemo(() => {
    const groups = new Map<string, IfcElementSummary[]>();
    for (const target of snapshot.selectedElements) {
      const element = getViewer()?.getBimElement(
        target.assetId,
        target.expressId,
      );
      if (!element) continue;
      const elements = groups.get(target.assetId) ?? [];
      elements.push(element);
      groups.set(target.assetId, elements);
    }
    return groups;
  }, [snapshot.selectedElements, getViewer]);

  return (
    <>
      {" "}
      {ifcSources.map((source, index) => {
        const model = snapshot.models.find(
          (item) => item.assetId === source.assetId,
        );
        const ready = model?.phase === "ready";
        const storeys = model?.catalog?.storeys ?? [];
        const modelTarget: BimLayerTarget = { kind: "model" };
        const modelMode =
          getViewer()?.getLayerVisibility(source.assetId, modelTarget) ??
          "show";
        const modelExceptions =
          getViewer()?.getLayerExceptionCount(source.assetId, modelTarget) ?? 0;
        return (
          <div
            className={styles.model}
            data-mode={modelMode}
            data-exceptions={modelExceptions > 0}
            key={source.assetId}
          >
            <ModelDisclosure
              selection={
                snapshot.activeModelId === source.assetId ? selection : null
              }
              defaultExpanded={index === 0}
              label={source.fileName}
              visibilityControl={
                ready ? (
                  <VisibilityCheckbox
                    exceptionCount={modelExceptions}
                    label={source.fileName}
                    mode={modelMode}
                    onChange={(mode) =>
                      getViewer()?.setLayerVisibility(
                        source.assetId,
                        { kind: "model" },
                        mode,
                      )
                    }
                  />
                ) : undefined
              }
            >
              {ready ? (
                <>
                  <button
                    className={styles.activate}
                    disabled={snapshot.activeModelId === source.assetId}
                    onClick={() => getViewer()?.setActiveModel(source.assetId)}
                    type="button"
                  >
                    {snapshot.activeModelId === source.assetId
                      ? "Maquette active"
                      : "Inspecter cette maquette"}
                  </button>
                  {storeys.map((storey) => (
                    <StoreyTree
                      assetId={source.assetId}
                      count={storey.elementCount}
                      getViewer={getViewer}
                      key={storey.expressId}
                      name={storey.name}
                      storeyId={storey.expressId}
                      selectedElements={(
                        selectedByModel.get(source.assetId) ?? []
                      ).filter(
                        (element) => element.storeyId === storey.expressId,
                      )}
                      selection={
                        snapshot.activeModelId === source.assetId &&
                        selection?.storeyId === storey.expressId
                          ? selection
                          : null
                      }
                    />
                  ))}
                  {model.catalog?.unassignedCount ? (
                    <StoreyTree
                      assetId={source.assetId}
                      count={model.catalog.unassignedCount}
                      getViewer={getViewer}
                      name="Éléments sans niveau"
                      storeyId={null}
                      selectedElements={(
                        selectedByModel.get(source.assetId) ?? []
                      ).filter((element) => element.storeyId === null)}
                      selection={
                        snapshot.activeModelId === source.assetId &&
                        selection?.storeyId === null
                          ? selection
                          : null
                      }
                    />
                  ) : null}
                </>
              ) : (
                <p className={styles.geoStatus}>
                  {model?.message ?? "Chargement en cours…"}
                </p>
              )}
            </ModelDisclosure>
          </div>
        );
      })}
      {snapshot.catalog ? (
        <InlineDisclosure label="Filtres et couleurs">
          <BimExplorer
            key={snapshot.activeModelId}
            catalog={snapshot.catalog}
            onColor={(query, color, label) =>
              getViewer()?.color(query, hexToRgba(color), label)
            }
            onColorByStorey={() => getViewer()?.colorByStorey()}
            onHide={(query, label) => getViewer()?.hide(query, label)}
            onIsolate={(query, label) => getViewer()?.isolate(query, label)}
            onReset={() => getViewer()?.resetVisuals()}
            onSetContext={(show, opacity) =>
              getViewer()?.setIsolationContext(show, opacity)
            }
            visual={snapshot.visual}
          />
        </InlineDisclosure>
      ) : null}
    </>
  );
}
