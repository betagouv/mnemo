"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  bcfDefaults,
  bcfTopicSchema,
  bcfProjectOptionsSchema,
  type BcfTopic,
} from "@mnemo/contracts/bcf";
import { z } from "zod";
import { readBcfWorkspace, summarizeTopic } from "@/entities/bcf";
import type { BcfWorkspaceProps } from "./bcf-workspace-types";

export function useBcfWorkspace({
  projectId,
  initialTopics,
  applyViewpoint,
  onTopicsChange,
  onActiveTopicChange,
  onMarkersChange,
  ref,
}: BcfWorkspaceProps) {
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
  const applyWorkspace = useCallback(
    (data: Awaited<ReturnType<typeof readBcfWorkspace>>) => {
      setTopics(data.topics);
      setOptions(data.options);
      setMembers(data.members);
      onTopicsChange(data.topics.length);
    },
    [onTopicsChange],
  );
  const readWorkspace = useCallback(
    async (signal?: AbortSignal) => {
      const data = await readBcfWorkspace(projectId, signal);
      if (!signal?.aborted) applyWorkspace(data);
    },
    [projectId, applyWorkspace],
  );
  useEffect(() => {
    const abort = new AbortController();
    void readBcfWorkspace(projectId, abort.signal)
      .then((data) => {
        if (!abort.signal.aborted) applyWorkspace(data);
      })
      .catch((error: unknown) => {
        if (!abort.signal.aborted)
          setError(
            error instanceof Error ? error.message : "Chargement impossible.",
          );
      });
    return () => abort.abort();
  }, [projectId, applyWorkspace]);
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

  const backToList = () => {
    requestRevision.current++;
    setScreen("list");
  };
  return {
    backToList,
    topics,
    options,
    members,
    screen,
    setScreen,
    active,
    busy,
    error,
    setError,
    search,
    setSearch,
    status,
    setStatus,
    assignee,
    setAssignee,
    markers,
    setMarkers,
    readWorkspace,
    open,
    saved,
    filtered,
    safeApply,
  };
}
