"use client";

import Button from "@codegouvfr/react-dsfr/Button";
import Badge from "@codegouvfr/react-dsfr/Badge";
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

type IfcLayer = { assetId: string; fileName: string };

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
              actions={
                <Button
                  iconId="fr-icon-focus-3-line"
                  size="small"
                  priority="tertiary no outline"
                  title={`Cadrer ${source.fileName}`}
                  disabled={!ready}
                  onClick={() => getViewer()?.frameModel(source.assetId)}
                />
              }
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
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge small noIcon>
                      IFC
                    </Badge>
                    <span className="text-xs text-[var(--text-mention-grey)]">
                      {storeys.length} niveaux
                    </span>
                  </div>
                  <button
                    className={styles.activate}
                    disabled={snapshot.activeModelId === source.assetId}
                    onClick={() => getViewer()?.setActiveModel(source.assetId)}
                    type="button"
                  >
                    {snapshot.activeModelId === source.assetId
                      ? "Maquette active"
                      : "Définir comme maquette active"}
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
    </>
  );
}
