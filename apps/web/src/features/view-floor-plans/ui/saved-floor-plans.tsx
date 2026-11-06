"use client";

import Alert from "@codegouvfr/react-dsfr/Alert";
import Button from "@codegouvfr/react-dsfr/Button";
import Input from "@codegouvfr/react-dsfr/Input";
import { createModal } from "@codegouvfr/react-dsfr/Modal";
import Select from "@codegouvfr/react-dsfr/Select";
import { useState } from "react";
import { createPortal } from "react-dom";
import styles from "./floor-plan-panel.module.css";
import type { useFloorPlans } from "../model/use-floor-plans";

type Controller = ReturnType<typeof useFloorPlans>;
const modal = createModal({
  id: "floor-plan-save-modal",
  isOpenedByDefault: false,
});
const Modal = modal.Component;

export function SavedFloorPlanSelect({
  controller,
}: {
  controller: Controller;
}) {
  const { saved, pending, open } = controller;
  if (!saved.views.length) return null;
  return (
    <Select
      className="mb-0"
      label="Vue enregistrée"
      nativeSelectProps={{
        value: saved.selected?.id ?? "",
        disabled: pending || saved.busy,
        onChange: (event) => {
          const view = saved.views.find(
            (item) => item.id === event.target.value,
          );
          if (view)
            void open(view.assetId, view.storeyId, view.storeyName, view);
          else saved.select();
        },
      }}
    >
      <option value="">Nouvelle vue</option>
      {saved.views.map((view) => (
        <option key={view.id} value={view.id}>
          {view.name}
        </option>
      ))}
    </Select>
  );
}

export function FloorPlanSaveActions({
  controller,
}: {
  controller: Controller;
}) {
  const { saved, pending, plan, preset, rules } = controller;
  const [name, setName] = useState("");
  const [asCopy, setAsCopy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  if (!plan) return null;
  const changed =
    !saved.selected ||
    saved.selected.assetId !== plan.assetId ||
    saved.selected.storeyId !== plan.storeyId ||
    JSON.stringify(saved.selected.style) !== JSON.stringify({ preset, rules });
  const defaultName = saved.selected?.name ?? plan.title;
  function openSave(copy: boolean) {
    setAsCopy(copy);
    setName(copy ? `${defaultName} (copie)`.slice(0, 160) : defaultName);
    modal.open();
  }
  return (
    <div className="flex-none border-t border-[var(--border-default-grey)] bg-[var(--background-default-grey)] p-4">
      <p className="mb-2 text-xs text-[var(--text-mention-grey)]" role="status">
        {!saved.selected
          ? "Vue non enregistrée"
          : changed
            ? "Modifications non enregistrées"
            : "Vue à jour"}
      </p>
      <Button
        className={styles.saveButton}
        size="small"
        disabled={pending || saved.busy}
        iconId="fr-icon-save-line"
        onClick={() => openSave(false)}
      >
        {saved.busy
          ? "Enregistrement…"
          : saved.selected
            ? "Enregistrer les modifications"
            : "Enregistrer cette vue"}
      </Button>
      {saved.selected ? (
        <div className="mt-1 flex flex-wrap justify-between gap-1">
          <Button
            size="small"
            priority="tertiary no outline"
            disabled={pending || saved.busy}
            onClick={() => openSave(true)}
          >
            Dupliquer
          </Button>
          <Button
            size="small"
            priority="tertiary no outline"
            disabled={pending || saved.busy}
            onClick={() => setConfirmDelete(true)}
          >
            Supprimer la vue
          </Button>
        </div>
      ) : null}
      {confirmDelete ? (
        <div
          className="mt-3"
          role="group"
          aria-label="Confirmer la suppression de la vue"
        >
          <p className="mb-2 text-sm">
            Supprimer la vue « {saved.selected?.name} » du dossier ?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="small"
              disabled={saved.busy}
              onClick={() => {
                saved.remove();
                setConfirmDelete(false);
              }}
            >
              Confirmer la suppression
            </Button>
            <Button
              size="small"
              priority="secondary"
              onClick={() => setConfirmDelete(false)}
            >
              Annuler
            </Button>
          </div>
        </div>
      ) : null}
      {saved.message?.error ? (
        <Alert
          className="mt-3"
          small
          severity="error"
          description={saved.message.text}
        />
      ) : null}
      {!saved.selected && saved.message && !saved.message.error ? (
        <p className="mb-0 mt-2 text-xs" role="status">
          {saved.message.text}
        </p>
      ) : null}
      {typeof document === "undefined"
        ? null
        : createPortal(
            <Modal
              title={
                asCopy
                  ? "Dupliquer la vue"
                  : saved.selected
                    ? "Enregistrer les modifications"
                    : "Enregistrer une vue"
              }
              titleAs="h2"
              size="small"
            >
              <p className="text-sm">
                Le niveau, le style et les règles seront enregistrés dans ce
                dossier.
              </p>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  saved.save(
                    plan,
                    { preset, rules },
                    { name, asCopy, onSaved: modal.close },
                  );
                }}
              >
                <Input
                  label="Nom de la vue"
                  nativeInputProps={{
                    value: name,
                    required: true,
                    maxLength: 160,
                    onChange: (event) => setName(event.target.value),
                  }}
                />
                {saved.message?.error ? (
                  <Alert
                    className="mb-4"
                    small
                    severity="error"
                    description={saved.message.text}
                  />
                ) : null}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    priority="secondary"
                    disabled={saved.busy}
                    nativeButtonProps={{ type: "button" }}
                    onClick={modal.close}
                  >
                    Annuler
                  </Button>
                  <Button
                    disabled={saved.busy || !name.trim()}
                    nativeButtonProps={{ type: "submit" }}
                  >
                    {saved.busy ? "Enregistrement…" : "Enregistrer"}
                  </Button>
                </div>
              </form>
            </Modal>,
            document.body,
          )}
    </div>
  );
}
