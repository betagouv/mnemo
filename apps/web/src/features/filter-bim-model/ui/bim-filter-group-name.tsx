"use client";
import { useState } from "react";
import Input from "@codegouvfr/react-dsfr/Input";
import Button from "@codegouvfr/react-dsfr/Button";
import styles from "./bim-filter-panel.module.css";

export function BimFilterGroupName({
  initial = "",
  onSave,
  onCancel,
}: {
  initial?: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <form
      className={styles.groupName}
      aria-label={initial ? "Renommer le groupe" : "Nouveau groupe"}
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) onSave(name.trim());
      }}
    >
      <Input
        label="Nom du groupe"
        nativeInputProps={{
          autoFocus: true,
          maxLength: 80,
          value: name,
          onChange: (event) => setName(event.target.value),
        }}
      />
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          size="small"
          priority="tertiary no outline"
          onClick={onCancel}
        >
          Annuler
        </Button>
        <Button type="submit" size="small" disabled={!name.trim()}>
          {initial ? "Renommer" : "Créer le groupe"}
        </Button>
      </div>
    </form>
  );
}
