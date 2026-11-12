"use client";
import Button from "@codegouvfr/react-dsfr/Button";
import styles from "./bim-filter-panel.module.css";

export function BimFilterGroupMenu({
  name,
  onRename,
  onDuplicate,
  onRemove,
}: {
  name: string;
  onRename: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <details
      className={styles.groupMenu}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          event.currentTarget.open = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.currentTarget.open) {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary aria-label={`Actions du groupe ${name}`}>
        <span aria-hidden="true" className="fr-icon-more-fill" />
      </summary>
      <div
        className={styles.groupMenuItems}
        onClick={(event) => {
          const details = event.currentTarget.closest("details");
          if (details) details.open = false;
        }}
      >
        <Button
          size="small"
          priority="tertiary no outline"
          iconId="fr-icon-edit-line"
          title={`Renommer ${name}`}
          onClick={onRename}
        >
          Renommer
        </Button>
        <Button
          size="small"
          priority="tertiary no outline"
          iconId="ri-file-copy-line"
          title={`Dupliquer le groupe ${name}`}
          onClick={onDuplicate}
        >
          Dupliquer
        </Button>
        <Button
          size="small"
          priority="tertiary no outline"
          iconId="fr-icon-delete-line"
          title={`Supprimer le groupe ${name}`}
          onClick={onRemove}
        >
          Supprimer
        </Button>
      </div>
    </details>
  );
}
