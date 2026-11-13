"use client";

import { useState, useTransition } from "react";
import type {
  BimFilterSettings,
  SavedBimFilters,
} from "@mnemo/contracts/bim-filters";
import { saveBimFilters } from "@/server/bim-filters/actions";

export function useSavedBimFilters(
  projectId: string,
  initial: SavedBimFilters[],
) {
  const [saved, setSaved] = useState(() =>
    Object.fromEntries(initial.map((item) => [item.assetId, item])),
  );
  const [drafts, setDrafts] = useState<Record<string, BimFilterSettings>>({});
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    assetId: string;
    error: boolean;
    text: string;
  } | null>(null);
  function update(assetId: string, settings: BimFilterSettings) {
    setDrafts((current) => ({ ...current, [assetId]: settings }));
    setMessage(null);
  }
  function save(assetId: string, settings: BimFilterSettings) {
    if (busy) return;
    startTransition(async () => {
      setMessage(null);
      try {
        const result = await saveBimFilters({
          projectId,
          assetId,
          version: saved[assetId]?.version ?? 0,
          settings,
        });
        if (!result.filters) {
          setMessage({ assetId, error: true, text: result.error });
          return;
        }
        const filters = result.filters;
        setSaved((current) => ({ ...current, [assetId]: filters }));
        setMessage({
          assetId,
          error: false,
          text: "Filtres enregistrés dans le dossier.",
        });
      } catch {
        setMessage({
          assetId,
          error: true,
          text: "Enregistrement impossible. Vérifiez votre connexion puis réessayez.",
        });
      }
    });
  }
  return { saved, drafts, update, save, busy, message };
}
