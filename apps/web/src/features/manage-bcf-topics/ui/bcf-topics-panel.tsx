"use client";

import type {
  BcfPriority,
  BcfTopic,
  BcfTopicStatus,
  BcfTopicType,
} from "@mnemo/contracts/bcf";
import type {
  CapturedBcfViewpoint,
  IfcElementDetails,
} from "@mnemo/ifc-viewer-adapter";
import Image from "next/image";
import { useMemo, useState, type FormEvent } from "react";

import { useTRPCClient } from "@/shared/api/trpc";

import styles from "./bcf-topics-panel.module.css";

const statusLabels: Record<BcfTopicStatus, string> = {
  open: "Ouverte",
  in_progress: "En cours",
  resolved: "Résolue",
  closed: "Fermée",
};

const priorityLabels: Record<BcfPriority, string> = {
  low: "Basse",
  normal: "Normale",
  high: "Haute",
  critical: "Critique",
};

export function BcfTopicsPanel({
  assetId,
  canCaptureViewpoint,
  initialTopics,
  onApplyViewpoint,
  onCaptureViewpoint,
  onFocusComponent,
  onTopicCountChange,
  projectId,
  selection,
}: {
  assetId: string;
  canCaptureViewpoint: boolean;
  initialTopics: BcfTopic[];
  onApplyViewpoint: (
    data: BcfTopic["viewpoints"][number]["data"],
    targetDistance: number,
  ) => void;
  onCaptureViewpoint: () => Promise<CapturedBcfViewpoint>;
  onFocusComponent: (expressId: number) => void;
  onTopicCountChange: (count: number) => void;
  projectId: string;
  selection: IfcElementDetails | null;
}) {
  const client = useTRPCClient();
  const [topics, setTopics] = useState(initialTopics);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(
    initialTopics[0]?.id ?? null,
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<BcfTopicType>("issue");
  const [priority, setPriority] = useState<BcfPriority>("normal");
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState<
    "topic" | "comment" | "status" | "viewpoint" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const activeTopic = useMemo(
    () => topics.find((topic) => topic.id === activeTopicId) ?? null,
    [activeTopicId, topics],
  );

  function replaceTopic(updated: BcfTopic) {
    setTopics((current) =>
      current.map((topic) => (topic.id === updated.id ? updated : topic)),
    );
  }

  async function createTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) return;

    setPending("topic");
    setMessage(null);
    try {
      const topic = await client.bcf.create.mutate({
        projectId,
        title,
        description: description || undefined,
        type,
        priority,
        component:
          selection?.globalId && selection.expressId > 0
            ? {
                assetId,
                globalId: selection.globalId,
                expressId: selection.expressId,
              }
            : undefined,
      });
      setTopics((current) => [topic, ...current]);
      onTopicCountChange(topics.length + 1);
      setActiveTopicId(topic.id);
      setTitle("");
      setDescription("");
      setMessage("Remarque créée");
    } catch {
      setMessage("La remarque n’a pas pu être créée.");
    } finally {
      setPending(null);
    }
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeTopic || !comment.trim()) return;

    setPending("comment");
    setMessage(null);
    try {
      const topic = await client.bcf.addComment.mutate({
        projectId,
        topicId: activeTopic.id,
        comment,
      });
      replaceTopic(topic);
      setComment("");
      setMessage("Commentaire ajouté");
    } catch {
      setMessage("Le commentaire n’a pas pu être ajouté.");
    } finally {
      setPending(null);
    }
  }

  async function updateStatus(status: BcfTopicStatus) {
    if (!activeTopic) return;
    setPending("status");
    setMessage(null);
    try {
      replaceTopic(
        await client.bcf.updateStatus.mutate({
          projectId,
          topicId: activeTopic.id,
          status,
        }),
      );
    } catch {
      setMessage("Le statut n’a pas pu être modifié.");
    } finally {
      setPending(null);
    }
  }

  async function captureViewpoint() {
    if (!activeTopic) return;
    setPending("viewpoint");
    setMessage(null);
    let viewpointCreated = false;

    try {
      const capture = await onCaptureViewpoint();
      const result = await client.bcf.beginViewpointCapture.mutate({
        projectId,
        topicId: activeTopic.id,
        data: capture.data,
        targetDistance: capture.targetDistance,
        snapshot: capture.snapshot
          ? {
              mediaType:
                capture.snapshot.type === "image/jpeg"
                  ? "image/jpeg"
                  : "image/png",
              sizeBytes: capture.snapshot.size,
            }
          : undefined,
      });
      replaceTopic(result.topic);
      viewpointCreated = true;

      if (result.snapshotUpload && capture.snapshot) {
        const response = await fetch(result.snapshotUpload.uploadUrl, {
          method: "PUT",
          headers: result.snapshotUpload.requiredHeaders,
          body: capture.snapshot,
        });
        if (!response.ok) {
          throw new Error(`Snapshot upload returned HTTP ${response.status}`);
        }
        replaceTopic(
          await client.bcf.completeViewpointCapture.mutate({
            projectId,
            topicId: activeTopic.id,
            viewpointId: result.viewpointId,
          }),
        );
      }
      setMessage(
        capture.snapshot
          ? "Vue et capture enregistrées"
          : "Vue enregistrée sans capture d’écran",
      );
    } catch {
      setMessage(
        viewpointCreated
          ? "La vue est enregistrée, mais pas sa capture d’écran."
          : "La vue n’a pas pu être enregistrée.",
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <div className={styles.panel}>
      <form
        className={styles.create}
        onSubmit={(event) => void createTopic(event)}
      >
        <div className={styles.sectionTitle}>
          <strong>Nouvelle remarque</strong>
          {selection?.globalId ? (
            <span title={selection.globalId}>
              liée à {selection.ifcClass} #{selection.expressId}
            </span>
          ) : (
            <span>sans élément lié</span>
          )}
        </div>
        <input
          aria-label="Titre de la remarque"
          maxLength={255}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Titre de la remarque"
          required
          value={title}
        />
        <textarea
          aria-label="Description de la remarque"
          maxLength={10_000}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Description"
          rows={3}
          value={description}
        />
        <div className={styles.fields}>
          <label>
            Type
            <select
              onChange={(event) => setType(event.target.value as BcfTopicType)}
              value={type}
            >
              <option value="issue">Problème</option>
              <option value="request">Demande</option>
              <option value="comment">Information</option>
            </select>
          </label>
          <label>
            Priorité
            <select
              onChange={(event) =>
                setPriority(event.target.value as BcfPriority)
              }
              value={priority}
            >
              {Object.entries(priorityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button disabled={pending !== null || !title.trim()} type="submit">
          <span className="fr-icon-add-line" aria-hidden="true" />
          {pending === "topic" ? "Création…" : "Créer"}
        </button>
      </form>

      {message ? <p className={styles.message}>{message}</p> : null}

      <section className={styles.topics}>
        <div className={styles.sectionTitle}>
          <strong>Remarques</strong>
          <span>{topics.length}</span>
        </div>
        {topics.length ? (
          <div className={styles.topicList}>
            {topics.map((topic) => (
              <button
                aria-pressed={topic.id === activeTopicId}
                key={topic.id}
                onClick={() => setActiveTopicId(topic.id)}
                type="button"
              >
                <span>
                  <i data-priority={topic.priority} />
                  {topic.title}
                </span>
                <small>
                  {statusLabels[topic.status]} · {topic.comments.length} comm.
                </small>
              </button>
            ))}
          </div>
        ) : (
          <p className={styles.empty}>Aucune remarque pour ce projet.</p>
        )}
      </section>

      {activeTopic ? (
        <section className={styles.detail}>
          <header>
            <div>
              <strong>{activeTopic.title}</strong>
              <span>
                {priorityLabels[activeTopic.priority]} ·{" "}
                {activeTopic.authorName}
              </span>
            </div>
            <select
              aria-label="Statut de la remarque"
              disabled={pending !== null}
              onChange={(event) =>
                void updateStatus(event.target.value as BcfTopicStatus)
              }
              value={activeTopic.status}
            >
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </header>
          {activeTopic.description ? <p>{activeTopic.description}</p> : null}
          {activeTopic.components.map((component) => (
            <button
              className={styles.component}
              disabled={component.assetId !== assetId || !component.expressId}
              key={component.id}
              onClick={() =>
                component.expressId && onFocusComponent(component.expressId)
              }
              title={component.globalId}
              type="button"
            >
              <span className="fr-icon-focus-3-line" aria-hidden="true" />
              Élément IFC #{component.expressId ?? "—"}
            </button>
          ))}
          <div className={styles.viewpointHeader}>
            <strong>Points de vue</strong>
            <button
              disabled={
                pending !== null || !canCaptureViewpoint || !activeTopic
              }
              onClick={() => void captureViewpoint()}
              type="button"
            >
              <span className="fr-icon-camera-line" aria-hidden="true" />
              {pending === "viewpoint" ? "Capture…" : "Capturer la vue"}
            </button>
          </div>
          {activeTopic.viewpoints.length ? (
            <div className={styles.viewpointList}>
              {activeTopic.viewpoints.map((viewpoint, index) => (
                <button
                  key={viewpoint.id}
                  onClick={() =>
                    onApplyViewpoint(viewpoint.data, viewpoint.targetDistance)
                  }
                  type="button"
                >
                  {viewpoint.snapshotUrl ? (
                    <Image
                      alt=""
                      crossOrigin="anonymous"
                      height={60}
                      loading="lazy"
                      src={viewpoint.snapshotUrl}
                      unoptimized
                      width={180}
                    />
                  ) : (
                    <span className="fr-icon-image-line" aria-hidden="true" />
                  )}
                  <span>
                    <strong>Vue {index + 1}</strong>
                    <small>{viewpoint.authorName}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>Aucun point de vue enregistré.</p>
          )}
          <div className={styles.comments}>
            {activeTopic.comments.map((item) => (
              <article key={item.id}>
                <header>
                  <strong>{item.authorName}</strong>
                  <time dateTime={item.createdAt}>
                    {new Intl.DateTimeFormat("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(item.createdAt))}
                  </time>
                </header>
                <p>{item.comment}</p>
              </article>
            ))}
          </div>
          <form
            className={styles.commentForm}
            onSubmit={(event) => void addComment(event)}
          >
            <textarea
              aria-label="Nouveau commentaire"
              maxLength={10_000}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Ajouter un commentaire"
              rows={2}
              value={comment}
            />
            <button
              disabled={pending !== null || !comment.trim()}
              type="submit"
            >
              {pending === "comment" ? "Envoi…" : "Commenter"}
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
