"use client";

import { useState, useTransition } from "react";
import type {
  BimFilterSettings,
  SavedBimFilters,
} from "@mnemo/contracts/bim-filters";
import { saveBimFilters } from "@/server/bim-filters/actions";

export function useSavedBimFilters(
  projectId: string,
  initial: SavedBimFilters | null,
) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<BimFilterSettings | null>(null);
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<{
    error: boolean;
    text: string;
  } | null>(null);
  function update(settings: BimFilterSettings) {
    setDraft(settings);
    setMessage(null);
  }
  function save(settings: BimFilterSettings) {
    if (busy) return;
    startTransition(async () => {
      setMessage(null);
      try {
        const result = await saveBimFilters({
          projectId,
          version: saved?.version ?? 0,
          settings,
        });
        if (!result.filters) {
          setMessage({ error: true, text: result.error });
          return;
        }
        setSaved(result.filters);
        setMessage({
          error: false,
          text: "Filtres enregistrés dans le dossier.",
        });
      } catch {
        setMessage({
          error: true,
          text: "Enregistrement impossible. Vérifiez votre connexion puis réessayez.",
        });
      }
    });
  }
  return { saved, draft, update, save, busy, message };
}
