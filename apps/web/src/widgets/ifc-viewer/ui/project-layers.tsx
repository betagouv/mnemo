"use client";

import Tabs from "@codegouvfr/react-dsfr/Tabs";
import {
  type IfcViewerController,
  type IfcViewerSnapshot,
} from "@mnemo/ifc-viewer-adapter";
import { useState } from "react";
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
          { tabId: "bim", label: `Maquettes (${ifcSources.length})` },
          {
            tabId: "survey",
            label: `Relevés (${pointCloudConfigurations.length})`,
          },
        ]}
      >
        <>
          <div className={styles.tabContent} hidden={tab !== "bim"}>
            <BimLayerTree
              snapshot={snapshot}
              ifcSources={ifcSources}
              getViewer={getViewer}
            />
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
