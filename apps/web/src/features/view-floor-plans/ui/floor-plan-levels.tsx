"use client";

import Button from "@codegouvfr/react-dsfr/Button";
import type { IfcViewerSnapshot } from "@mnemo/ifc-viewer-adapter";
import type { useFloorPlans } from "../model/use-floor-plans";
import styles from "./floor-plan-panel.module.css";

export function FloorPlanLevels({
  models,
  controller,
}: {
  models: IfcViewerSnapshot["models"];
  controller: ReturnType<typeof useFloorPlans>;
}) {
  const { plan, saved, open, pending } = controller;
  return (
    <nav aria-label="Plans par étage">
      <h3 className="mb-2 text-base">Plans par étage</h3>
      {models.map((model) => (
        <section key={model.assetId} aria-label={model.fileName}>
          {models.length > 1 && (
            <h4 className="my-2 break-words text-sm">{model.fileName}</h4>
          )}
          <ul className="m-0 list-none p-0">
            {model.catalog?.storeys.map((level) => {
              const current =
                plan?.assetId === model.assetId &&
                plan.storeyId === level.expressId &&
                !saved.selected;
              const views = saved.views.filter(
                (view) =>
                  view.assetId === model.assetId &&
                  view.storeyId === level.expressId,
              );
              return (
                <li key={level.expressId} className="p-0">
                  <Button
                    size="small"
                    className={styles.levelLink}
                    priority="tertiary no outline"
                    iconId="fr-icon-layout-grid-line"
                    disabled={pending || saved.busy || level.elevation === null}
                    nativeButtonProps={{
                      "aria-current": current ? "page" : undefined,
                    }}
                    onClick={() => {
                      if (!current)
                        void open(model.assetId, level.expressId, level.name);
                    }}
                  >
                    {level.name}
                    {level.elevation === null && " — altitude indisponible"}
                  </Button>
                  {views.length > 0 && (
                    <ul
                      aria-label={`Vues enregistrées de ${level.name}`}
                      className="my-1 ml-4 list-none border-l border-[var(--border-default-grey)] pl-2"
                    >
                      {views.map((view) => (
                        <li key={view.id} className="p-0">
                          <Button
                            size="small"
                            className={styles.levelLink}
                            priority="tertiary no outline"
                            iconId="fr-icon-bookmark-line"
                            disabled={pending || saved.busy}
                            nativeButtonProps={{
                              "aria-current":
                                saved.selected?.id === view.id
                                  ? "page"
                                  : undefined,
                            }}
                            onClick={() => {
                              if (saved.selected?.id !== view.id)
                                void open(
                                  view.assetId,
                                  view.storeyId,
                                  view.storeyName,
                                  view,
                                );
                            }}
                          >
                            {view.name}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}
