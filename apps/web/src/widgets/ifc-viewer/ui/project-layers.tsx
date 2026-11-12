"use client";

import Button from "@codegouvfr/react-dsfr/Button";
import Tabs from "@codegouvfr/react-dsfr/Tabs";
import {
  type IfcViewerController,
  type IfcViewerSnapshot,
} from "@mnemo/ifc-viewer-adapter";
import { useEffect, useRef, useState } from "react";
import {
  PointCloudPanel,
  type PointCloudConfiguration,
} from "@/features/configure-point-cloud";
import styles from "./project-layers.module.css";
import { BimLayerTree } from "@/features/explore-bim-model";

type IfcLayer = { assetId: string; fileName: string };

type PointCloudFailure = { assetId: string; fileName: string; error: string };

export function ProjectLayers({
  snapshot,
  revealSelectionRequest = 0,
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
  revealSelectionRequest?: number;
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
  const rootRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState("bim");
  const [lastReveal, setLastReveal] = useState(revealSelectionRequest);
  if (lastReveal !== revealSelectionRequest) {
    setLastReveal(revealSelectionRequest);
    setTab("bim");
  }

  useEffect(() => {
    if (!revealSelectionRequest) return;
    const frame = requestAnimationFrame(() =>
      rootRef.current
        ?.querySelector('[aria-current="true"]')
        ?.scrollIntoView({ block: "nearest" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [revealSelectionRequest]);

  return (
    <div className={styles.panel} ref={rootRef}>
      <Tabs
        className={styles.tabs}
        onTabChange={setTab}
        selectedTabId={tab}
        tabs={[
          { tabId: "bim", label: `Maquettes (${ifcSources.length})` },
          {
            tabId: "survey",
            label: `Relevés (${pointCloudConfigurations.length})`,
          },
        ]}
      >
        <>
          <div className={styles.tabContent} hidden={tab !== "bim"}>
            {ifcSources.length ? (
              <BimLayerTree
                snapshot={snapshot}
                ifcSources={ifcSources}
                getViewer={getViewer}
              />
            ) : (
              <div className="p-3">
                <p className="text-sm">Aucune maquette IFC dans ce dossier.</p>
                <Button
                  size="small"
                  priority="tertiary no outline"
                  linkProps={{ href: `/projets/${projectId}` }}
                >
                  Voir les fichiers du dossier
                </Button>
              </div>
            )}
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
