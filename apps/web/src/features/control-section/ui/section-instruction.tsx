"use client";

import { useEffect } from "react";
import Button from "@codegouvfr/react-dsfr/Button";
import type { IfcSectionSnapshot } from "@mnemo/ifc-viewer-adapter";

export function SectionInstruction({
  section,
  onCancel,
}: {
  section: IfcSectionSnapshot;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!section.pickMode) return;
    const cancelOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCancel();
    };
    window.addEventListener("keydown", cancelOnEscape, true);
    return () => window.removeEventListener("keydown", cancelOnEscape, true);
  }, [section.pickMode, onCancel]);
  if (!section.pickMode) return null;
  return (
    <div
      className="absolute left-1/2 top-4 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 border border-[var(--border-default-grey)] bg-[var(--background-default-grey)] px-3 py-2 shadow-md"
      role="status"
    >
      <span className="text-sm">
        {section.pickMode === "face"
          ? "Cliquez sur une face de la maquette."
          : section.draftPoint === null
            ? "Cliquez sur le premier point de la coupe."
            : "Cliquez sur le second point pour terminer la coupe."}
      </span>
      <Button size="small" priority="tertiary no outline" onClick={onCancel}>
        Annuler
      </Button>
    </div>
  );
}
