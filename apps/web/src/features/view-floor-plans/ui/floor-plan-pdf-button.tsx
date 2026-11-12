"use client";

import Button from "@codegouvfr/react-dsfr/Button";
import Alert from "@codegouvfr/react-dsfr/Alert";
import type { FloorPlanRule } from "@mnemo/contracts/floor-plans";
import {
  type FloorPlanDrawing,
  type FloorPlanPresetId,
} from "@mnemo/ifc-viewer-adapter";
import { createFloorPlanPdf } from "../infrastructure/pdf/floor-plan-pdf";
import type { FloorPlanPdfInfo } from "../infrastructure/pdf/floor-plan-pdf-sheet";
import { useState } from "react";

export function FloorPlanPdfButton({
  drawing,
  preset,
  rules,
  title,
  context,
}: {
  drawing: FloorPlanDrawing;
  preset: FloorPlanPresetId;
  rules: readonly FloorPlanRule[];
  title: string;
  context: Pick<
    FloorPlanPdfInfo,
    | "projectName"
    | "sourceName"
    | "storeyName"
    | "storeyElevation"
    | "verticalDatum"
  >;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function download() {
    setBusy(true);
    setError(false);
    try {
      const response = await fetch("/mnemo-operator.png");
      if (!response.ok) throw new Error("Logo Mnemo indisponible.");
      const logo = new Uint8Array(await response.arrayBuffer());
      const blob = await createFloorPlanPdf(drawing, preset, rules, {
        ...context,
        title,
        logo,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${title.replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 100) || "plan"}.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        size="small"
        priority="secondary"
        iconId="fr-icon-download-line"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? "Export…" : "Télécharger le PDF"}
      </Button>
      {error ? (
        <Alert
          small
          severity="error"
          description="L'export PDF a échoué. Réessayez."
        />
      ) : null}
    </>
  );
}
