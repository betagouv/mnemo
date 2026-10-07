"use client";

import Tabs from "@codegouvfr/react-dsfr/Tabs";
import {
  type BimLayerTarget,
  type IfcElementSummary,
  type IfcViewerController,
  type IfcViewerSnapshot,
} from "@mnemo/ifc-viewer-adapter";
import { useState } from "react";

import { BimExplorer } from "@/features/filter-bim-model";
import {
  PointCloudPanel,
  type PointCloudConfiguration,
} from "@/features/configure-point-cloud";
import { VisibilityCheckbox } from "@/shared/ui/visibility-checkbox";
import { InlineDisclosure } from "@/shared/ui/inline-disclosure";

import styles from "./project-layers.module.css";

type IfcLayer = { assetId: string; fileName: string };
type PointCloudFailure = { assetId: string; fileName: string; error: string };

function hexToRgba(hex: string): [number, number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16) / 255,
    Number.parseInt(value.slice(2, 4), 16) / 255,
    Number.parseInt(value.slice(4, 6), 16) / 255,
    1,
  ];
}

function ClassTree({
  assetId,
  count,
  getViewer,
  ifcClass,
  storeyId,
}: {
  assetId: string;
  count: number;
  getViewer: () => IfcViewerController | null;
  ifcClass: string;
  storeyId: number | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [limit, setLimit] = useState(50);
  const viewer = getViewer();
  const target: BimLayerTarget = { kind: "class", storeyId, ifcClass };
  const mode = viewer?.getLayerVisibility(assetId, target) ?? "show";
  const exceptions = viewer?.getLayerExceptionCount(assetId, target) ?? 0;
  const elements: IfcElementSummary[] = expanded
    ? (viewer?.getBimElements(assetId, storeyId, 0, limit, ifcClass) ?? [])
    : [];

  return (
    <div
      className={styles.classGroup}
      data-mode={mode}
      data-exceptions={exceptions > 0}
    >
      <VisibilityCheckbox
        exceptionCount={exceptions}
        label={ifcClass}
        mode={mode}
        onChange={(next) => viewer?.setLayerVisibility(assetId, target, next)}
      />
      <button
        aria-expanded={expanded}
        className={styles.treeToggle}
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <span className={styles.chevron} aria-hidden="true">
          {expanded ? "⌄" : "›"}
        </span>
        <span title={ifcClass}>{ifcClass}</span>
        {exceptions > 0 ? <em className={styles.exception}>Mixte</em> : null}
        <small>{count.toLocaleString("fr-FR")}</small>
      </button>
      {expanded ? (
        <div className={styles.elements}>
          {elements.map((element) => {
            const elementTarget: BimLayerTarget = {
              kind: "element",
              expressId: element.expressId,
            };
            const label =
              element.name || `${element.ifcClass} #${element.expressId}`;
            return (
              <div className={styles.element} key={element.expressId}>
                <VisibilityCheckbox
                  label={label}
                  mode={
                    viewer?.getLayerVisibility(assetId, elementTarget) ?? "show"
                  }
                  onChange={(next) =>
                    viewer?.setLayerVisibility(assetId, elementTarget, next)
                  }
                />
                <button
                  className={styles.elementName}
                  onClick={() => {
                    viewer?.setActiveModel(assetId);
                    viewer?.selectEntity(element.expressId);
                  }}
                  title={`${label} · ${element.ifcClass} · #${element.expressId}`}
                  type="button"
                >
                  {label}
                </button>
              </div>
            );
          })}
          {elements.length < count ? (
            <button
              className={styles.more}
              onClick={() => setLimit(limit + 50)}
              type="button"
            >
              Afficher 50 éléments de plus
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StoreyTree({
  assetId,
  name,
  count,
  storeyId,
  getViewer,
}: {
  assetId: string;
  name: string;
  count: number;
  storeyId: number | null;
  getViewer: () => IfcViewerController | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const viewer = getViewer();
  const target: BimLayerTarget =
    storeyId === null
      ? { kind: "unassigned" }
      : { kind: "storey", expressId: storeyId };
  const mode = viewer?.getLayerVisibility(assetId, target) ?? "show";
  const exceptions = viewer?.getLayerExceptionCount(assetId, target) ?? 0;
  const classes = expanded
    ? (viewer?.getBimClasses(assetId, storeyId) ?? [])
    : [];

  return (
    <div
      className={styles.storey}
      data-mode={mode}
      data-exceptions={exceptions > 0}
    >
      <VisibilityCheckbox
        exceptionCount={exceptions}
        label={name}
        mode={mode}
        onChange={(next) => viewer?.setLayerVisibility(assetId, target, next)}
      />
      <button
        aria-expanded={expanded}
        className={styles.treeToggle}
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        <span className={styles.chevron} aria-hidden="true">
          {expanded ? "⌄" : "›"}
        </span>
        <span title={name}>{name}</span>
        {exceptions > 0 ? <em className={styles.exception}>Mixte</em> : null}
        <small>{count.toLocaleString("fr-FR")}</small>
      </button>
      {expanded ? (
        <div className={styles.groups}>
          {classes.map((entry) => (
            <ClassTree
              assetId={assetId}
              count={entry.elementCount}
              getViewer={getViewer}
              ifcClass={entry.ifcClass}
              key={entry.ifcClass}
              storeyId={storeyId}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ProjectLayers({
  snapshot,
  ifcSources,
  hiddenPointCloudIds,
  pointCloudConfigurations,
  pointCloudFailures,
  pointBudget,
  pointSize,
  projectId,
  getViewer,
  onPointCloudConfigurationChange,
  onPointCloudVisibilityChange,
  onPointSizeChange,
  onPointBudgetChange,
}: {
  snapshot: IfcViewerSnapshot;
  ifcSources: IfcLayer[];
  hiddenPointCloudIds: ReadonlySet<string>;
  pointCloudConfigurations: PointCloudConfiguration[];
  pointCloudFailures: PointCloudFailure[];
  pointBudget: number;
  pointSize: number;
  projectId: string;
  getViewer: () => IfcViewerController | null;
  onPointCloudConfigurationChange: (
    configuration: PointCloudConfiguration,
  ) => void;
  onPointCloudVisibilityChange: (assetId: string, visible: boolean) => void;
  onPointSizeChange: (size: number) => void;
  onPointBudgetChange: (budget: number) => void;
}) {
  const [tab, setTab] = useState("bim");

  return (
    <div className={styles.panel}>
      <Tabs
        className={styles.tabs}
        onTabChange={setTab}
        selectedTabId={tab}
        tabs={[
          { tabId: "bim", label: "BIM" },
          { tabId: "survey", label: "Relevé 3D" },
        ]}
      >
        <>
          <div className={styles.tabContent} hidden={tab !== "bim"}>
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
                getViewer()?.getLayerExceptionCount(
                  source.assetId,
                  modelTarget,
                ) ?? 0;
              return (
                <div
                  className={styles.model}
                  data-mode={modelMode}
                  data-exceptions={modelExceptions > 0}
                  key={source.assetId}
                >
                  <InlineDisclosure
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
                          onClick={() =>
                            getViewer()?.setActiveModel(source.assetId)
                          }
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
                          />
                        ))}
                        {model.catalog?.unassignedCount ? (
                          <StoreyTree
                            assetId={source.assetId}
                            count={model.catalog.unassignedCount}
                            getViewer={getViewer}
                            name="Éléments sans niveau"
                            storeyId={null}
                          />
                        ) : null}
                      </>
                    ) : (
                      <p className={styles.geoStatus}>
                        {model?.message ?? "Chargement en cours…"}
                      </p>
                    )}
                  </InlineDisclosure>
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
                  onIsolate={(query, label) =>
                    getViewer()?.isolate(query, label)
                  }
                  onReset={() => getViewer()?.resetVisuals()}
                  onSetContext={(show, opacity) =>
                    getViewer()?.setIsolationContext(show, opacity)
                  }
                  visual={snapshot.visual}
                />
              </InlineDisclosure>
            ) : null}
          </div>
          <div className={styles.tabContent} hidden={tab !== "survey"}>
            {pointCloudConfigurations.length ? (
              <PointCloudPanel
                configurations={pointCloudConfigurations}
                hiddenAssetIds={hiddenPointCloudIds}
                maxPoints={pointBudget}
                onConfigurationChange={onPointCloudConfigurationChange}
                onVisibilityChange={onPointCloudVisibilityChange}
                onPointSizeChange={onPointSizeChange}
                onReload={onPointBudgetChange}
                pointClouds={snapshot.pointClouds}
                pointSize={pointSize}
                projectId={projectId}
              />
            ) : (
              <p className={styles.empty}>
                Aucun nuage de points dans ce projet.
              </p>
            )}
            {pointCloudFailures.map((failure) => (
              <p
                className={styles.geoStatus}
                key={failure.assetId}
                title={failure.error}
              >
                {failure.fileName} : source indisponible
              </p>
            ))}
          </div>
        </>
      </Tabs>
    </div>
  );
}
