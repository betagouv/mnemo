"use client";

import type {
  IfcBimCatalog,
  IfcBimQuery,
  IfcVisualSnapshot,
} from "@mnemo/ifc-viewer-adapter";
import { useMemo, useState } from "react";
import Button from "@codegouvfr/react-dsfr/Button";
import Select from "@codegouvfr/react-dsfr/Select";
import Accordion from "@codegouvfr/react-dsfr/Accordion";
import Checkbox from "@codegouvfr/react-dsfr/Checkbox";
import Range from "@codegouvfr/react-dsfr/Range";

function queryLabel(
  catalog: IfcBimCatalog,
  ifcClass: string,
  storeyId: string,
) {
  const storey = catalog.storeys.find(
    (item) => item.expressId === Number(storeyId),
  );
  if (ifcClass && storey) return `${ifcClass} · ${storey.name}`;
  return ifcClass || storey?.name || "Toute la maquette";
}

export function BimExplorer({
  catalog,
  visual,
  onColor,
  onColorByStorey,
  onHide,
  onIsolate,
  onReset,
  onSetContext,
}: {
  catalog: IfcBimCatalog;
  visual: IfcVisualSnapshot;
  onColor: (query: IfcBimQuery, color: string, label: string) => void;
  onColorByStorey: () => void;
  onHide: (query: IfcBimQuery, label: string) => void;
  onIsolate: (query: IfcBimQuery, label: string) => void;
  onReset: () => void;
  onSetContext: (show: boolean, opacity: number) => void;
}) {
  const [ifcClass, setIfcClass] = useState("");
  const [storeyId, setStoreyId] = useState("");
  const [color, setColor] = useState("#6a6af4");
  const query = useMemo<IfcBimQuery>(
    () => ({
      ifcClass: ifcClass || null,
      storeyId: storeyId ? Number(storeyId) : null,
    }),
    [ifcClass, storeyId],
  );
  const label = queryLabel(catalog, ifcClass, storeyId);
  const hasCriteria = Boolean(ifcClass || storeyId);

  return (
    <div className="flex flex-col gap-4 p-4">
      <Select
        label="Classe IFC"
        nativeSelectProps={{
          value: ifcClass,
          onChange: (event) => setIfcClass(event.target.value),
        }}
      >
        <option value="">Toutes les classes</option>
        {catalog.types.map((type) => (
          <option key={type.ifcClass} value={type.ifcClass}>
            {type.ifcClass} ({type.elementCount.toLocaleString("fr-FR")})
          </option>
        ))}
      </Select>
      <Select
        label="Niveau"
        nativeSelectProps={{
          value: storeyId,
          onChange: (event) => setStoreyId(event.target.value),
        }}
      >
        <option value="">Tous les niveaux</option>
        {catalog.storeys.map((storey) => (
          <option key={storey.expressId} value={storey.expressId}>
            {storey.name}
          </option>
        ))}
      </Select>
      <div className="flex flex-wrap gap-2">
        <Button
          size="small"
          disabled={!hasCriteria}
          onClick={() => onIsolate(query, label)}
        >
          Isoler
        </Button>
        <Button
          size="small"
          priority="secondary"
          disabled={!hasCriteria}
          onClick={() => onHide(query, label)}
        >
          Masquer
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm" htmlFor="viewer-color">
          Couleur
        </label>
        <input
          aria-label="Couleur des éléments"
          className="h-9 w-9 cursor-pointer border border-[var(--border-default-grey)] bg-transparent p-1"
          id="viewer-color"
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
        />
        <Button
          size="small"
          priority="secondary"
          disabled={!hasCriteria}
          onClick={() => onColor(query, color, label)}
        >
          Appliquer
        </Button>
      </div>
      <Button
        size="small"
        priority="secondary"
        disabled={!catalog.storeys.length}
        onClick={onColorByStorey}
      >
        Colorer par niveau
      </Button>
      <Accordion label="Contexte de l’isolation">
        <Checkbox
          options={[
            {
              label: "Afficher le reste en transparence",
              nativeInputProps: {
                checked: visual.showContext,
                onChange: (event) =>
                  onSetContext(event.target.checked, visual.contextOpacity),
              },
            },
          ]}
        />
        <Range
          small
          label="Opacité du contexte"
          min={2}
          max={50}
          suffix=" %"
          disabled={!visual.showContext}
          nativeInputProps={{
            value: Math.round(visual.contextOpacity * 100),
            onChange: (event) =>
              onSetContext(
                visual.showContext,
                Number(event.target.value) / 100,
              ),
          }}
        />
      </Accordion>
      {visual.mode !== "all" ? (
        <div
          className="border-l-2 border-[var(--border-action-high-blue-france)] bg-[var(--background-alt-blue-france)] p-3 text-sm"
          role="status"
        >
          <strong>{visual.label}</strong>
          <p className="mb-2">
            {visual.matchCount.toLocaleString("fr-FR")} éléments concernés
          </p>
          <Button size="small" priority="tertiary no outline" onClick={onReset}>
            Réinitialiser l’affichage
          </Button>
        </div>
      ) : null}
    </div>
  );
}
