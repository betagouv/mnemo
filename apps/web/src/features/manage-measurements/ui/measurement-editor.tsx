"use client";
import Button from "@codegouvfr/react-dsfr/Button";
import Input from "@codegouvfr/react-dsfr/Input";
import { useState } from "react";
import type { SaveMeasurementInput } from "@mnemo/contracts/measurements";
import { useProjectMeasurements } from "@/entities/measurement";

export function MeasurementEditor({
  measurement,
  onSaved,
  onDiscard,
}: {
  measurement: Omit<SaveMeasurementInput, "projectId">;
  onSaved?: () => void;
  onDiscard?: () => void;
}) {
  const store = useProjectMeasurements();
  const saved = store.items.find((item) => item.id === measurement.id);
  const [name, setName] = useState(measurement.name);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  return (
    <div className="min-w-0 flex-1">
      {store.canManage && editing ? (
        <Input
          label="Nom de la mesure"
          className="mb-2"
          nativeInputProps={{
            value: name,
            maxLength: 160,
            disabled: store.busy,
            onChange: (event) => setName(event.target.value),
          }}
        />
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="break-words">{saved?.name ?? name}</span>
          {store.canManage ? (
            <Button
              size="small"
              priority="tertiary no outline"
              title="Renommer la mesure"
              iconId="fr-icon-edit-line"
              disabled={store.busy}
              onClick={() => setEditing(true)}
            />
          ) : null}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {store.canManage && (!saved || editing) ? (
          <Button
            size="small"
            priority="secondary"
            iconId="fr-icon-save-line"
            disabled={
              store.busy ||
              !name.trim() ||
              (saved && name.trim() === saved.name)
            }
            onClick={async () => {
              if (await store.save({ ...measurement, name })) {
                setEditing(false);
                onSaved?.();
              }
            }}
          >
            {saved ? "Enregistrer le nom" : "Enregistrer la mesure"}
          </Button>
        ) : null}
        {saved ? (
          <span className="text-xs text-[var(--text-mention-grey)]">
            Enregistrée dans le dossier
          </span>
        ) : (
          <span className="text-xs text-[var(--text-mention-grey)]">
            Non enregistrée
          </span>
        )}
        {!saved || store.canManage ? (
          <Button
            size="small"
            priority="tertiary no outline"
            iconId="fr-icon-delete-line"
            title="Supprimer la mesure"
            disabled={store.busy}
            onClick={() => {
              if (saved) setConfirmDelete(true);
              else onDiscard?.();
            }}
          />
        ) : null}
      </div>
      {confirmDelete && saved ? (
        <div className="mt-2">
          <p className="mb-1 text-sm">
            Supprimer « {saved.name} » pour tous les membres du dossier ?
          </p>
          <div className="flex gap-2">
            <Button
              size="small"
              disabled={store.busy}
              onClick={async () => {
                if (await store.remove(saved)) setConfirmDelete(false);
              }}
            >
              Confirmer la suppression
            </Button>
            <Button
              size="small"
              priority="tertiary no outline"
              onClick={() => setConfirmDelete(false)}
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
