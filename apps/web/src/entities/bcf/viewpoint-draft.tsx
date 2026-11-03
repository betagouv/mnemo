"use client";
import { useEffect, useRef, useState } from "react";
import Button from "@codegouvfr/react-dsfr/Button";
import type { CapturedBcfViewpoint } from "@mnemo/ifc-viewer-adapter";
import styles from "./viewpoint-draft.module.css";
export function ViewpointDraft({
  value,
  onChange,
  capture,
  disabled,
  onBusyChange,
}: {
  value: CapturedBcfViewpoint | null;
  onChange: (view: CapturedBcfViewpoint | null) => void;
  capture: () => Promise<CapturedBcfViewpoint>;
  disabled: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const previewRef = useRef<HTMLImageElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const url = value?.snapshot ? URL.createObjectURL(value.snapshot) : null;
    if (previewRef.current && url) previewRef.current.src = url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [value]);
  return (
    <div className={styles.draft}>
      {value?.snapshot ? (
        // Screenshot previews use temporary object URLs; Next image optimisation is unnecessary.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={styles.preview}
          ref={previewRef}
          alt="Aperçu de la vue qui sera enregistrée"
        />
      ) : null}
      <div className={styles.actions}>
        <Button
          type="button"
          priority="secondary"
          size="small"
          iconId="fr-icon-camera-line"
          disabled={disabled || busy}
          onClick={() => {
            setBusy(true);
            onBusyChange?.(true);
            setError(null);
            void capture()
              .then(onChange)
              .catch((error: unknown) =>
                setError(
                  error instanceof Error
                    ? error.message
                    : "Capture impossible.",
                ),
              )
              .finally(() => {
                setBusy(false);
                onBusyChange?.(false);
              });
          }}
        >
          {busy
            ? "Capture…"
            : value
              ? "Reprendre la capture"
              : "Capturer la vue actuelle"}
        </Button>
        {value ? (
          <Button
            type="button"
            size="small"
            priority="tertiary no outline"
            disabled={disabled || busy}
            onClick={() => onChange(null)}
          >
            Retirer
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
