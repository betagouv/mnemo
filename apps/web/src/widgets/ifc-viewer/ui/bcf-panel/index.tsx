"use client";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type Ref,
} from "react";
import Button from "@codegouvfr/react-dsfr/Button";
import Input from "@codegouvfr/react-dsfr/Input";
import Select from "@codegouvfr/react-dsfr/Select";
import Badge from "@codegouvfr/react-dsfr/Badge";
import Alert from "@codegouvfr/react-dsfr/Alert";
import Checkbox from "@codegouvfr/react-dsfr/Checkbox";
import {
  bcfDefaults,
  bcfTopicSchema,
  bcfTopicSummarySchema,
  bcfProjectOptionsSchema,
  type BcfMarkerTopic,
  type BcfTopic,
  type BcfTopicSummary,
  type CreateBcfTopicInput,
} from "@mnemo/contracts/bcf";
import type { CapturedBcfViewpoint } from "@mnemo/ifc-viewer-adapter";
import { z } from "zod";
import { bcfLabel, summarizeTopic } from "@/entities/bcf";
import { BcfTopicEditor, type BcfObject } from "@/features/create-bcf-topic";
import { BcfExchange } from "@/features/exchange-bcf";
import { uploadViewpoint } from "@/features/capture-bcf-viewpoint";
import styles from "./bcf-panel.module.css";

const workspaceSchema = z.object({
  topics: z.array(bcfTopicSummarySchema),
  options: bcfProjectOptionsSchema,
  members: z.array(
    z.object({ id: z.uuid(), name: z.string(), email: z.string() }),
  ),
});
import type { BcfPermissions } from "./types";
import { BcfTopicDetail } from "./topic-detail";
export function BcfPanel({
  projectId,
  initialTopics,
  permissions,
  selection,
  queryObjects,
  previewObjects,
  capture,
  canCapture,
  applyViewpoint,
  focusObject,
  onTopicsChange,
  onActiveTopicChange,
  onMarkersChange,
  ref,
}: {
  projectId: string;
  initialTopics: BcfTopicSummary[];
  permissions: BcfPermissions;
  selection: BcfObject | null;
  queryObjects: () => BcfObject[];
  previewObjects: (objects: CreateBcfTopicInput["components"]) => void;
  capture: (
    objects?: CreateBcfTopicInput["components"],
  ) => Promise<CapturedBcfViewpoint>;
  canCapture: boolean;
  applyViewpoint: (view: BcfTopic["viewpoints"][number]) => string[];
  focusObject: (component: BcfTopic["components"][number]) => boolean;
  onTopicsChange: (count: number) => void;
  onActiveTopicChange: (id: string | null) => void;
  onMarkersChange: (topics: BcfMarkerTopic[]) => void;
  ref?: Ref<{ open: (id: string) => Promise<void> }>;
}) {
  const [topics, setTopics] = useState(initialTopics);
  const [options, setOptions] = useState<
    z.infer<typeof bcfProjectOptionsSchema>
  >({
    ...bcfDefaults,
    statuses: [...bcfDefaults.statuses],
    types: [...bcfDefaults.types],
    priorities: [...bcfDefaults.priorities],
  });
  const [members, setMembers] = useState<
    Array<{ id: string; name: string; email: string }>
  >([]);
  const [screen, setScreen] = useState<"list" | "detail" | "create" | "edit">(
    "list",
  );
  const [active, setActive] = useState<BcfTopic | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [assignee, setAssignee] = useState("");
  const [markers, setMarkers] = useState(false);
  const requestRevision = useRef(0);
  const readWorkspace = useCallback(
    async (signal?: AbortSignal) => {
      const response = await fetch(`/api/projects/${projectId}/bcf/topics`, {
        cache: "no-store",
        signal,
      });
      if (!response.ok) throw new Error("Impossible de charger les remarques.");
      const data = workspaceSchema.parse(await response.json());
      setTopics(data.topics);
      setOptions(data.options);
      setMembers(data.members);
      onTopicsChange(data.topics.length);
    },
    [projectId, onTopicsChange],
  );
  useEffect(() => {
    const abort = new AbortController();
    // Fetch completion updates React; the effect itself only starts/cancels IO.
    const load = async () => {
      const response = await fetch(`/api/projects/${projectId}/bcf/topics`, {
        cache: "no-store",
        signal: abort.signal,
      });
      if (!response.ok) throw new Error("Impossible de charger les remarques.");
      return workspaceSchema.parse(await response.json());
    };
    void load()
      .then((data) => {
        if (abort.signal.aborted) return;
        setTopics(data.topics);
        setOptions(data.options);
        setMembers(data.members);
        onTopicsChange(data.topics.length);
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setError(
            error instanceof Error ? error.message : "Chargement impossible.",
          );
      });
    return () => abort.abort();
  }, [projectId, onTopicsChange]);
  const open = useCallback(
    async (id: string) => {
      if (
        (screen === "create" || screen === "edit") &&
        !confirm("Abandonner les modifications de cette remarque ?")
      )
        return;
      const revision = ++requestRevision.current;
      setBusy(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/projects/${projectId}/bcf/topics?topicId=${id}`,
          { cache: "no-store" },
        );
        if (!response.ok)
          throw new Error("Impossible d’ouvrir cette remarque.");
        const topic = bcfTopicSchema.parse(await response.json());
        if (revision !== requestRevision.current) return;
        setActive(topic);
        onActiveTopicChange(topic.id);
        setScreen("detail");
      } catch (error) {
        if (revision === requestRevision.current)
          setError(
            error instanceof Error ? error.message : "Chargement impossible.",
          );
      } finally {
        if (revision === requestRevision.current) setBusy(false);
      }
    },
    [projectId, screen, onActiveTopicChange],
  );
  useImperativeHandle(ref, () => ({ open }), [open]);
  useEffect(() => {
    if (!markers) return;
    const abort = new AbortController();
    void fetch(`/api/projects/${projectId}/bcf/topics?markers`, {
      cache: "no-store",
      signal: abort.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Chargement des repères impossible.");
        const { bcfMarkerTopicSchema } = await import("@mnemo/contracts/bcf");
        onMarkersChange(
          z
            .array(bcfMarkerTopicSchema)
            .parse(await response.json())
            .filter((topic) => !status || topic.status === status)
            .filter(
              (topic) =>
                !search ||
                `${topic.title} ${topic.number}`
                  .toLocaleLowerCase()
                  .includes(search.toLocaleLowerCase()),
            )
            .filter(
              (topic) =>
                !assignee ||
                topics.find((item) => item.id === topic.id)?.assignedTo ===
                  assignee,
            ),
        );
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setError(
            error instanceof Error ? error.message : "Repères indisponibles.",
          );
      });
    return () => abort.abort();
  }, [markers, topics, projectId, onMarkersChange, status, search, assignee]);
  const saved = (topic: BcfTopic) => {
    setActive(topic);
    onActiveTopicChange(topic.id);
    setScreen("detail");
    setTopics((items) => [
      summarizeTopic(topic),
      ...items.filter((item) => item.id !== topic.id),
    ]);
    onTopicsChange(
      topics.some((item) => item.id === topic.id)
        ? topics.length
        : topics.length + 1,
    );
  };
  const filtered = topics.filter(
    (topic) =>
      (!status || topic.status === status) &&
      (!assignee || topic.assignedTo === assignee) &&
      `${topic.title} ${topic.number}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  const safeApply = (view: BcfTopic["viewpoints"][number]) => {
    setError(null);
    try {
      const unresolved = applyViewpoint(view);
      if (unresolved.length)
        setError(
          `${unresolved.length} référence(s) d’objet sont absentes ou ambiguës dans les maquettes chargées. La vue est restaurée avec les objets disponibles.`,
        );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Restauration impossible.",
      );
    }
  };
  return (
    <div className={styles.root}>
      {error ? <Alert severity="error" small description={error} /> : null}
      {busy ? <p role="status">Chargement…</p> : null}
      <div className={styles.content} data-screen={screen}>
        {screen === "create" || screen === "edit" ? (
          <>
            <h2 className={styles.screenTitle}>
              {screen === "create"
                ? "Nouvelle remarque"
                : "Modifier la remarque"}
            </h2>
            <BcfTopicEditor
              key={screen + active?.id}
              projectId={projectId}
              topic={screen === "edit" ? (active ?? undefined) : undefined}
              options={options}
              members={members}
              selection={selection}
              queryObjects={queryObjects}
              previewObjects={previewObjects}
              capture={capture}
              canCapture={canCapture}
              upload={(view) => uploadViewpoint(projectId, view)}
              onSaved={saved}
              onCancel={() => setScreen(screen === "edit" ? "detail" : "list")}
            />
          </>
        ) : screen === "detail" && active ? (
          <BcfTopicDetail
            key={active.id}
            projectId={projectId}
            active={active}
            permissions={permissions}
            members={members}
            canCapture={canCapture}
            capture={capture}
            focusObject={focusObject}
            queryObjects={queryObjects}
            onSaved={saved}
            onApply={safeApply}
            onBack={() => {
              requestRevision.current++;
              setScreen("list");
            }}
            onEdit={() => setScreen("edit")}
            onError={setError}
          />
        ) : (
          <>
            {permissions.createTopic ? (
              <Button
                size="small"
                iconId="fr-icon-add-line"
                onClick={() => {
                  setError(null);
                  setScreen("create");
                }}
              >
                Nouvelle remarque
              </Button>
            ) : null}
            <Input
              label="Rechercher une remarque"
              nativeInputProps={{
                value: search,
                onChange: (event) => setSearch(event.target.value),
                placeholder: "Titre ou numéro",
              }}
            />
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Statut"
                nativeSelectProps={{
                  value: status,
                  onChange: (event) => setStatus(event.target.value),
                }}
              >
                <option value="">Tous</option>
                {[
                  ...new Set([
                    ...options.statuses,
                    ...topics.map((topic) => topic.status),
                  ]),
                ].map((value) => (
                  <option key={value} value={value}>
                    {bcfLabel(value)}
                  </option>
                ))}
              </Select>
              <Select
                label="Responsable"
                nativeSelectProps={{
                  value: assignee,
                  onChange: (event) => setAssignee(event.target.value),
                }}
              >
                <option value="">Tous</option>
                {[
                  ...new Set(
                    topics.flatMap((topic) =>
                      topic.assignedTo ? [topic.assignedTo] : [],
                    ),
                  ),
                ].map((email) => (
                  <option key={email} value={email}>
                    {members.find((member) => member.email === email)?.name ??
                      email}
                  </option>
                ))}
              </Select>
            </div>
            <Checkbox
              options={[
                {
                  label: "Afficher les repères dans la scène",
                  nativeInputProps: {
                    checked: markers,
                    onChange: (event) => {
                      setMarkers(event.target.checked);
                      if (!event.target.checked) onMarkersChange([]);
                    },
                  },
                },
              ]}
            />
            <p className="text-sm !m-0" role="status">
              {filtered.length} remarque(s)
            </p>
            <ul className="!p-0 !m-0 list-none grid gap-2">
              {filtered.map((topic) => (
                <li
                  key={topic.id}
                  className="border-b border-[var(--border-default-grey)] pb-3"
                >
                  <Button
                    className="!justify-start !text-left !px-0"
                    priority="tertiary no outline"
                    onClick={() => void open(topic.id)}
                  >
                    #{topic.number} · {topic.title}
                  </Button>
                  <div className="flex items-center gap-2">
                    <Badge small noIcon>
                      {bcfLabel(topic.status)}
                    </Badge>
                    <span className="text-sm">
                      {topic.commentCount} commentaire(s)
                    </span>
                  </div>
                  <p className="text-sm text-[var(--text-mention-grey)] !mt-1 !mb-0">
                    {members.find((member) => member.email === topic.assignedTo)
                      ?.name ??
                      topic.assignedTo ??
                      "Non attribué"}
                    {topic.dueDate ? ` · ${topic.dueDate}` : ""}
                  </p>
                </li>
              ))}
            </ul>
            {!filtered.length ? (
              <p className="!m-0">
                {topics.length
                  ? "Aucune remarque ne correspond aux filtres."
                  : "Aucune remarque dans ce dossier."}
              </p>
            ) : null}
            <BcfExchange
              projectId={projectId}
              canImport={permissions.createTopic}
              onImported={() =>
                void readWorkspace().catch(() =>
                  setError("Rechargement impossible."),
                )
              }
            />
          </>
        )}
      </div>
    </div>
  );
}
