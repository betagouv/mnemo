"use client";
import { useEffect, useState } from "react";
import Button from "@codegouvfr/react-dsfr/Button";
import type { ViewerFeedback } from "../model/use-viewer-feedback";
export function ViewerActionMessage({
  feedback,
  onDismiss,
}: {
  feedback: ViewerFeedback | null;
  onDismiss: () => void;
}) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!feedback || paused) return;
    const timer = window.setTimeout(onDismiss, 6000);
    return () => window.clearTimeout(timer);
  }, [feedback, paused, onDismiss]);
  if (!feedback) return null;
  return (
    <div
      className="absolute bottom-4 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded border border-[var(--border-default-grey)] bg-[var(--background-default-grey)] p-2 shadow-md"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setPaused(false);
      }}
    >
      <span className="px-1 text-sm" role="status">
        {feedback.message}
      </span>
      {feedback.undo && (!feedback.canUndo || feedback.canUndo()) ? (
        <Button
          size="small"
          priority="secondary"
          onClick={() => {
            feedback.undo?.();
            onDismiss();
          }}
        >
          Annuler
        </Button>
      ) : null}
      <Button
        size="small"
        priority="tertiary no outline"
        iconId="fr-icon-close-line"
        title="Fermer le message"
        onClick={onDismiss}
      />
    </div>
  );
}
