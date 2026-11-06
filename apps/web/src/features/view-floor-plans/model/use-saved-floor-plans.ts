"use client";
import { useState, useTransition } from "react";
import {
  floorPlanStyleSchema,
  type SavedFloorPlan,
  type FloorPlanStyleSettings,
} from "@mnemo/contracts/floor-plans";
import { saveFloorPlan, deleteFloorPlan } from "@/server/floor-plans/actions";

export function useSavedFloorPlans(
  projectId: string,
  initial: SavedFloorPlan[],
) {
  const [views, setViews] = useState(initial);
  const [selectedId, setSelectedId] = useState("");
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  const selected = views.find((view) => view.id === selectedId);
  function select(view?: SavedFloorPlan) {
    setSelectedId(view?.id ?? "");
    setMessage(null);
  }
  function save(
    source: { assetId: string; storeyId: number; title: string },
    style: FloorPlanStyleSettings,
    options: { name: string; asCopy: boolean; onSaved: () => void },
  ) {
    if (busy) return;
    if (!floorPlanStyleSchema.safeParse(style).success) {
      setMessage({
        error: true,
        text: "Vérifiez le nom et les valeurs des règles.",
      });
      return;
    }
    startTransition(async () => {
      setMessage(null);
      try {
        const result = await saveFloorPlan({
          projectId,
          assetId: source.assetId,
          storeyId: source.storeyId,
          storeyName: source.title,
          style,
          name: options.name.trim(),
          target:
            !options.asCopy && selected
              ? { id: selected.id, version: selected.version }
              : undefined,
        });
        if (!result.plan) {
          setMessage({ error: true, text: result.error });
          return;
        }
        const saved = result.plan;
        setViews((current) => [
          saved,
          ...current.filter((view) => view.id !== saved.id),
        ]);
        setSelectedId(saved.id);
        setMessage({ error: false, text: "Vue enregistrée." });
        options.onSaved();
      } catch {
        setMessage({
          error: true,
          text: "Enregistrement impossible. Vérifiez votre connexion.",
        });
      }
    });
  }
  function remove() {
    if (!selected || busy) return;
    startTransition(async () => {
      setMessage(null);
      try {
        const result = await deleteFloorPlan({
          projectId,
          id: selected.id,
          version: selected.version,
        });
        if (result.error) {
          setMessage({ error: true, text: result.error });
          return;
        }
        setViews((current) =>
          current.filter((view) => view.id !== selected.id),
        );
        select();
        setMessage({ error: false, text: "Vue supprimée." });
      } catch {
        setMessage({
          error: true,
          text: "Suppression impossible. Vérifiez votre connexion.",
        });
      }
    });
  }
  return {
    views,
    selected,
    select,
    save,
    remove,
    busy,
    message,
  };
}
