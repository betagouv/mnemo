"use client";

import { useState } from "react";
import Input from "@codegouvfr/react-dsfr/Input";
import Button from "@codegouvfr/react-dsfr/Button";
import Alert from "@codegouvfr/react-dsfr/Alert";
import type { BcfTopic } from "@mnemo/contracts/bcf";
import type { CapturedBcfViewpoint } from "@mnemo/ifc-viewer-adapter";
import { bcfDate } from "@/entities/bcf";
import { ViewpointDraft } from "@/entities/bcf";
import type { BcfViewpointDraft } from "@mnemo/contracts/bcf";
import { addBcfComment } from "@/server/bcf/actions";
import styles from "./discussion.module.css";

export function BcfDiscussion({
  projectId,
  topic,
  canComment,
  canCapture,
  capture,
  onSaved,
  onView,
  upload,
}: {
  projectId: string;
  topic: BcfTopic;
  canComment: boolean;
  canCapture: boolean;
  capture: () => Promise<CapturedBcfViewpoint>;
  onSaved: (topic: BcfTopic) => void;
  onView: (view: BcfTopic["viewpoints"][number]) => void;
  upload: (
    view: CapturedBcfViewpoint | null,
  ) => Promise<BcfViewpointDraft | undefined>;
}) {
  const [text, setText] = useState("");
  const [view, setView] = useState<CapturedBcfViewpoint | null>(null);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <section className={styles.discussion} aria-label="Discussion">
      <ol className={styles.thread}>
        {topic.comments.map((comment) => {
          const related = topic.viewpoints.find(
            (view) => view.data.guid === comment.viewpointBcfGuid,
          );
          return (
            <li key={comment.id}>
              <article className={styles.comment}>
                <header className={styles.commentHeader}>
                  <strong>{comment.authorName}</strong>
                  <time dateTime={comment.createdAt}>
                    {bcfDate(comment.createdAt)}
                  </time>
                </header>
                <p className={styles.body}>{comment.comment}</p>
                {related ? (
                  <Button
                    size="small"
                    priority="tertiary no outline"
                    iconId="fr-icon-eye-line"
                    title="Afficher la vue du commentaire"
                    onClick={() => onView(related)}
                  >
                    Voir la vue
                  </Button>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>
      {!topic.comments.length ? (
        <p className={styles.empty}>Aucun commentaire pour le moment.</p>
      ) : null}
      {canComment ? (
        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault();
            setBusy(true);
            setError(null);
            void (async () => {
              const updated = await addBcfComment({
                projectId,
                topicId: topic.id,
                comment: text,
                viewpoint: await upload(view),
              });
              setText("");
              setView(null);
              onSaved(updated);
            })()
              .catch((error: unknown) =>
                setError(
                  error instanceof Error ? error.message : "Envoi impossible.",
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          <Input
            label="Votre commentaire"
            textArea
            nativeTextAreaProps={{
              value: text,
              onChange: (event) => setText(event.target.value),
              required: true,
              maxLength: 10000,
              rows: 2,
              disabled: busy,
            }}
          />
          <details className={styles.attachment}>
            <summary>
              {view ? "Une vue est jointe" : "Joindre une vue (facultatif)"}
            </summary>
            <div>
              <ViewpointDraft
                onBusyChange={setCapturing}
                value={view}
                onChange={setView}
                capture={capture}
                disabled={!canCapture || busy}
              />
            </div>
          </details>
          {error ? <Alert severity="error" small description={error} /> : null}
          <Button
            size="small"
            type="submit"
            disabled={busy || capturing || !text.trim()}
          >
            {busy ? "Envoi…" : "Publier le commentaire"}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
