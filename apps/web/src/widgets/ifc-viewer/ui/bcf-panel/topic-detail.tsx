"use client";
import { useMemo, useState } from "react";
import Button from "@codegouvfr/react-dsfr/Button";
import Badge from "@codegouvfr/react-dsfr/Badge";
import Tabs from "@codegouvfr/react-dsfr/Tabs";
import styles from "./topic-detail.module.css";
import type { BcfTopic } from "@mnemo/contracts/bcf";
import type { CapturedBcfViewpoint } from "@mnemo/ifc-viewer-adapter";
import { bcfLabel, bcfDate, ViewpointDraft, BcfSnapshot } from "@/entities/bcf";
import { BcfDiscussion } from "@/features/comment-bcf-topic";
import { uploadViewpoint } from "@/features/capture-bcf-viewpoint";
import { saveBcfViewpoint } from "@/server/bcf/actions";
import type { BcfPermissions } from "./types";
export function BcfTopicDetail({
  projectId,
  active,
  permissions,
  members,
  canCapture,
  capture,
  focusObject,
  queryObjects,
  onSaved: saved,
  onApply: safeApply,
  onBack,
  onEdit,
  onError: setError,
}: {
  projectId: string;
  active: BcfTopic;
  permissions: BcfPermissions;
  members: Array<{ id: string; name: string; email: string }>;
  canCapture: boolean;
  capture: () => Promise<CapturedBcfViewpoint>;
  queryObjects: () => Array<{
    assetId: string | null;
    globalId: string;
    name: string;
  }>;
  focusObject: (component: BcfTopic["components"][number]) => boolean;
  onSaved: (topic: BcfTopic) => void;
  onApply: (view: BcfTopic["viewpoints"][number]) => void;
  onBack: () => void;
  onEdit: () => void;
  onError: (error: string | null) => void;
}) {
  const [tab, setTab] = useState("remark");
  const [view, setView] = useState<CapturedBcfViewpoint | null>(null);
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const objectNames = useMemo(() => {
    const names = new Map<string, string>();
    const counts = new Map<string, number>();
    for (const object of canCapture ? queryObjects() : []) {
      names.set(`${object.assetId}:${object.globalId}`, object.name);
      names.set(object.globalId, object.name);
      counts.set(object.globalId, (counts.get(object.globalId) ?? 0) + 1);
    }
    return { names, counts };
  }, [queryObjects, canCapture]);
  const objectName = (component: BcfTopic["components"][number]) =>
    objectNames.names.get(`${component.assetId}:${component.globalId}`) ??
    (objectNames.counts.get(component.globalId) === 1
      ? objectNames.names.get(component.globalId)
      : undefined) ??
    component.globalId;
  const metadata = (label: string, value: string) => (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
  const saveView = () => {
    setBusy(true);
    setError(null);
    void uploadViewpoint(projectId, view)
      .then((draft) =>
        draft
          ? saveBcfViewpoint({
              projectId,
              topicId: active.id,
              viewpoint: draft,
            })
          : null,
      )
      .then((topic) => {
        if (topic) {
          setView(null);
          saved(topic);
        }
      })
      .catch((error: unknown) =>
        setError(
          error instanceof Error ? error.message : "Enregistrement impossible.",
        ),
      )
      .finally(() => setBusy(false));
  };
  return (
    <div className={styles.detail}>
      <header className={styles.header}>
        <Button
          size="small"
          priority="tertiary no outline"
          iconId="fr-icon-arrow-left-line"
          disabled={busy || capturing}
          onClick={onBack}
        >
          Toutes les remarques
        </Button>
        <div className={styles.eyebrow}>
          <span>#{active.number}</span>
          <Badge small noIcon>
            {bcfLabel(active.status)}
          </Badge>
        </div>
        <div className={styles.titleRow}>
          <h2 className={styles.title}>{active.title}</h2>
          {permissions.updateTopic ? (
            <Button
              size="small"
              priority="tertiary no outline"
              iconId="fr-icon-edit-line"
              title="Modifier la remarque"
              onClick={onEdit}
            />
          ) : null}
        </div>
        <p className={styles.author}>
          {active.authorName} ·{" "}
          <time dateTime={active.createdAt}>{bcfDate(active.createdAt)}</time>
        </p>
      </header>
      <Tabs
        className={styles.tabs}
        classes={{ panel: styles.tabPanel }}
        label="Contenu de la remarque"
        tabs={[
          { tabId: "remark", label: "Remarque" },
          {
            tabId: "views",
            label: `Vues (${active.viewpoints.length})`,
            disabled: busy || capturing,
          },
          {
            tabId: "discussion",
            label: `Discussion (${active.comments.length})`,
            disabled: busy || capturing,
          },
        ]}
        selectedTabId={tab}
        onTabChange={setTab}
      >
        <div className={styles.tabContent} hidden={tab !== "remark"}>
          <p className={styles.description}>
            {active.description || "Aucune description."}
          </p>
          <dl className={styles.metadata}>
            {metadata("Type", bcfLabel(active.type))}
            {metadata("Priorité", bcfLabel(active.priority))}
            {metadata(
              "Responsable",
              members.find((member) => member.email === active.assignedTo)
                ?.name ??
                active.assignedTo ??
                "Non attribué",
            )}
            {metadata(
              "Échéance",
              active.dueDate
                ? new Intl.DateTimeFormat("fr-FR").format(
                    new Date(active.dueDate),
                  )
                : "Aucune",
            )}
          </dl>
          {active.components.length ? (
            <details className={styles.objects}>
              <summary>
                {active.components.length} objet
                {active.components.length > 1 ? "s" : ""} concerné
                {active.components.length > 1 ? "s" : ""}
              </summary>
              <ul>
                {active.components.map((component) => (
                  <li key={component.id}>
                    <Button
                      className={styles.objectButton}
                      size="small"
                      priority="tertiary no outline"
                      title={component.globalId}
                      onClick={() => {
                        if (!focusObject(component))
                          setError(
                            "Cet objet n’est pas disponible ou sa référence est ambiguë dans les maquettes chargées.",
                          );
                      }}
                    >
                      {objectName(component)}
                    </Button>
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <p className="fr-hint-text !m-0">Remarque générale sur le projet</p>
          )}
        </div>
        <div className={styles.tabContent} hidden={tab !== "views"}>
          {active.viewpoints.map((item, index) => (
            <article
              key={item.id}
              className={styles.view}
              aria-label={`Vue ${index + 1}`}
            >
              {item.snapshotUrl ? (
                <BcfSnapshot
                  key={item.snapshotUrl}
                  src={item.snapshotUrl}
                  alt={`Capture de la vue ${index + 1}`}
                  className={styles.snapshot}
                />
              ) : (
                <p className="fr-hint-text !m-0">Vue sans capture d’écran</p>
              )}
              <Button
                priority="secondary"
                size="small"
                iconId="fr-icon-eye-line"
                disabled={!canCapture}
                onClick={() => safeApply(item)}
              >
                Afficher cette vue
                {active.viewpoints.length > 1 ? ` (${index + 1})` : ""}
              </Button>
            </article>
          ))}
          {!active.viewpoints.length ? (
            <p className="fr-text--sm !m-0">Aucune vue enregistrée.</p>
          ) : null}
          {permissions.createViewpoint ? (
            <details className={styles.addView}>
              <summary>Ajouter une vue</summary>
              <div className={styles.addViewContent}>
                <ViewpointDraft
                  onBusyChange={setCapturing}
                  value={view}
                  onChange={setView}
                  capture={capture}
                  disabled={!canCapture || busy}
                />
                {view ? (
                  <Button
                    size="small"
                    disabled={busy || capturing}
                    onClick={saveView}
                  >
                    Enregistrer cette vue
                  </Button>
                ) : null}
              </div>
            </details>
          ) : null}
        </div>
        <div className={styles.tabContent} hidden={tab !== "discussion"}>
          <BcfDiscussion
            key={active.id}
            projectId={projectId}
            topic={active}
            canComment={permissions.createComment}
            canCapture={canCapture}
            capture={capture}
            upload={(view) => uploadViewpoint(projectId, view)}
            onSaved={saved}
            onView={safeApply}
          />
        </div>
      </Tabs>
    </div>
  );
}
