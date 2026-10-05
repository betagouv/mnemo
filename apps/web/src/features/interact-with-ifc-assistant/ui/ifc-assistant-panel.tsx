"use client";

import { AssistantChatTransport, useChatRuntime } from "@assistant-ui/ai-sdk";
import {
  AssistantRuntimeProvider,
  AuiConfig,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  Tools,
  type ToolCallMessagePartProps,
} from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import type {
  AssistantThreadHistory,
  AssistantThreadSummary,
} from "@mnemo/contracts/assistant";
import { assistantThreadHistorySchema } from "@mnemo/contracts/assistant";
import type { IfcViewerController } from "@mnemo/ifc-viewer-adapter";
import type { UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import remarkGfm from "remark-gfm";

import {
  createAssistantThread,
  deleteAssistantThread,
} from "@/server/assistant/actions";
import { fetchJson } from "@/shared/lib/fetch-json";

import { createViewerToolActions } from "../model/viewer-tool-actions";
import { createViewerAssistantToolkit } from "../model/viewer-toolkit";

import styles from "./ifc-assistant-panel.module.css";

const suggestions = [
  "Quelles classes IFC et quels niveaux sont présents ?",
  "Affiche uniquement les murs en bleu.",
  "Sélectionne un élément et explique-moi ses propriétés.",
];

function threadTitle(messages: UIMessage[]) {
  const userMessage = messages.find((message) => message.role === "user");
  const text = userMessage?.parts
    .filter(
      (part): part is typeof part & { text: string } =>
        part.type === "text" && "text" in part,
    )
    .map((part) => part.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return "Nouvelle conversation";
  return text.length <= 160 ? text : `${text.slice(0, 157).trimEnd()}…`;
}

function MarkdownText() {
  return (
    <MarkdownTextPrimitive
      className={styles.markdown}
      defer
      remarkPlugins={[remarkGfm]}
    />
  );
}

function ToolFallback({ toolName, status }: ToolCallMessagePartProps) {
  return (
    <div className={styles.toolTrace} data-status={status.type}>
      <span aria-hidden="true" />
      <small>{toolName.replaceAll("_", " ")}</small>
    </div>
  );
}

const messageComponents = {
  Text: MarkdownText,
  tools: { Fallback: ToolFallback },
};

function UserMessage() {
  return (
    <MessagePrimitive.Root className={styles.userMessage}>
      <MessagePrimitive.Content components={messageComponents} />
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className={styles.assistantMessage}>
      <div className={styles.assistantIdentity} aria-hidden="true">
        M
      </div>
      <div className={styles.assistantContent}>
        <MessagePrimitive.Content components={messageComponents} />
        <MessagePrimitive.Error>
          <p className={styles.messageError}>
            La réponse a échoué. Vérifiez la configuration OpenRouter puis
            réessayez.
          </p>
        </MessagePrimitive.Error>
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantThread() {
  return (
    <ThreadPrimitive.Root className={styles.thread}>
      <ThreadPrimitive.Viewport className={styles.viewport}>
        <ThreadPrimitive.Empty>
          <div className={styles.welcome}>
            <div className={styles.welcomeMark} aria-hidden="true">
              M
            </div>
            <strong>Interrogez votre maquette</strong>
            <span className={styles.mcpStatus}>
              <i aria-hidden="true" /> IFC-Lite MCP · lecture BIM
            </span>
            <p>
              L’assistant peut lire la structure BIM et piloter la scène sans
              recréer le renderer ni déplacer la caméra sans demande explicite.
            </p>
            <div className={styles.suggestions}>
              {suggestions.map((suggestion) => (
                <ThreadPrimitive.Suggestion
                  key={suggestion}
                  prompt={suggestion}
                  send
                  type="button"
                >
                  {suggestion}
                </ThreadPrimitive.Suggestion>
              ))}
            </div>
          </div>
        </ThreadPrimitive.Empty>

        <ThreadPrimitive.Messages
          components={{
            UserMessage,
            AssistantMessage,
          }}
        />

        <ThreadPrimitive.ViewportFooter className={styles.footer}>
          <ThreadPrimitive.ScrollToBottom
            aria-label="Revenir au dernier message"
            className={styles.scrollButton}
            type="button"
          >
            ↓
          </ThreadPrimitive.ScrollToBottom>
          <ComposerPrimitive.Root className={styles.composer}>
            <ComposerPrimitive.Input
              aria-label="Message pour l’assistant BIM"
              className={styles.input}
              placeholder="Demandez une analyse ou une action sur la maquette…"
              rows={2}
            />
            <ThreadPrimitive.If running={false}>
              <ComposerPrimitive.Send
                aria-label="Envoyer le message"
                className={styles.sendButton}
                type="button"
              >
                <span aria-hidden="true">↑</span>
              </ComposerPrimitive.Send>
            </ThreadPrimitive.If>
            <ThreadPrimitive.If running>
              <ComposerPrimitive.Cancel
                aria-label="Arrêter la réponse"
                className={styles.sendButton}
                type="button"
              >
                <span aria-hidden="true">■</span>
              </ComposerPrimitive.Cancel>
            </ThreadPrimitive.If>
          </ComposerPrimitive.Root>
          <small className={styles.disclaimer}>
            Vérifiez les résultats avant toute décision métier.
          </small>
        </ThreadPrimitive.ViewportFooter>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
}

export function IfcAssistantPanel({
  assetId,
  configured,
  getViewer,
  hidden,
  initialHistory,
  initialThreads,
  mcpConfigured,
  projectId,
}: {
  assetId: string;
  configured: boolean;
  getViewer: () => IfcViewerController | null;
  hidden: boolean;
  initialHistory: AssistantThreadHistory | null;
  initialThreads: AssistantThreadSummary[];
  mcpConfigured: boolean;
  projectId: string;
}) {
  const actions = useMemo(
    () => createViewerToolActions(getViewer),
    [getViewer],
  );
  const toolkit = useMemo(
    () => createViewerAssistantToolkit(actions),
    [actions],
  );
  const config = AuiConfig({ tools: Tools({ toolkit }) });
  const [threads, setThreads] = useState(initialThreads);
  const [history, setHistory] = useState(initialHistory);
  const [loading, setLoading] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);
  const creatingInitialThread = useRef(false);

  const openThread = useCallback(
    async (threadId: string) => {
      setLoading(true);
      setThreadError(null);
      try {
        const nextHistory = await fetchJson(
          `/api/projects/${projectId}/assets/${assetId}/assistant/threads/${threadId}`,
          assistantThreadHistorySchema,
        );
        setHistory(nextHistory);
      } catch {
        setThreadError("La conversation n’a pas pu être chargée.");
      } finally {
        setLoading(false);
      }
    },
    [assetId, projectId],
  );

  const createThread = useCallback(async () => {
    setLoading(true);
    setThreadError(null);
    try {
      const thread = await createAssistantThread({
        projectId,
        assetId,
      });
      setThreads((current) => [thread, ...current]);
      setHistory({ thread, messages: [] });
    } catch {
      setThreadError("La conversation n’a pas pu être créée.");
    } finally {
      setLoading(false);
    }
  }, [assetId, projectId]);

  useEffect(() => {
    if (
      !configured ||
      !mcpConfigured ||
      threads.length > 0 ||
      history ||
      creatingInitialThread.current
    ) {
      return;
    }
    creatingInitialThread.current = true;
    void createThread();
  }, [configured, createThread, history, mcpConfigured, threads.length]);

  const deleteThread = useCallback(async () => {
    if (!history || !window.confirm("Supprimer cette conversation ?")) return;
    setLoading(true);
    setThreadError(null);
    try {
      await deleteAssistantThread({
        projectId,
        assetId,
        threadId: history.thread.id,
      });
      const remaining = threads.filter(
        (thread) => thread.id !== history.thread.id,
      );
      setThreads(remaining);
      if (remaining[0]) {
        const nextHistory = await fetchJson(
          `/api/projects/${projectId}/assets/${assetId}/assistant/threads/${remaining[0].id}`,
          assistantThreadHistorySchema,
        );
        setHistory(nextHistory);
      } else {
        setHistory(null);
        creatingInitialThread.current = false;
      }
    } catch {
      setThreadError("La conversation n’a pas pu être supprimée.");
    } finally {
      setLoading(false);
    }
  }, [assetId, history, projectId, threads]);

  const updateCurrentThreadTitle = useCallback(
    (messages: UIMessage[]) => {
      const title = threadTitle(messages);
      const updatedAt = new Date().toISOString();
      setThreads((current) =>
        current
          .map((thread) =>
            thread.id === history?.thread.id
              ? { ...thread, title, updatedAt }
              : thread,
          )
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      );
      setHistory((current) =>
        current
          ? {
              ...current,
              thread: { ...current.thread, title, updatedAt },
            }
          : current,
      );
    },
    [history?.thread.id],
  );

  return (
    <section className={styles.panel} hidden={hidden}>
      {configured && mcpConfigured ? (
        <>
          <div className={styles.threadToolbar}>
            <label>
              <span className="fr-sr-only">Conversation active</span>
              <select
                aria-label="Conversation active"
                disabled={loading || !history}
                onChange={(event) => void openThread(event.target.value)}
                value={history?.thread.id ?? ""}
              >
                {!history ? <option value="">Chargement…</option> : null}
                {threads.map((thread) => (
                  <option key={thread.id} value={thread.id}>
                    {thread.id === history?.thread.id
                      ? history.thread.title
                      : thread.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              aria-label="Nouvelle conversation"
              disabled={loading}
              onClick={() => void createThread()}
              title="Nouvelle conversation"
              type="button"
            >
              <span className="fr-icon-add-line" aria-hidden="true" />
            </button>
            <button
              aria-label="Supprimer la conversation"
              disabled={loading || !history}
              onClick={() => void deleteThread()}
              title="Supprimer la conversation"
              type="button"
            >
              <span className="fr-icon-delete-line" aria-hidden="true" />
            </button>
          </div>
          {threadError ? (
            <p className={styles.threadError} role="alert">
              {threadError}
            </p>
          ) : null}
          {history ? (
            <AssistantSession
              assetId={assetId}
              config={config}
              history={history}
              key={history.thread.id}
              onFinish={updateCurrentThreadTitle}
              projectId={projectId}
            />
          ) : (
            <div className={styles.threadLoading} role="status">
              Préparation de la conversation…
            </div>
          )}
        </>
      ) : !configured ? (
        <div className={styles.notConfigured} role="status">
          <span className="fr-icon-lock-line" aria-hidden="true" />
          <strong>Assistant non configuré</strong>
          <p>
            Ajoutez <code>OPENROUTER_API_KEY</code> au fichier <code>.env</code>
            , puis redémarrez le service web.
          </p>
          <small>Modèle par défaut : google/gemini-3.7-flash</small>
        </div>
      ) : (
        <div className={styles.notConfigured} role="status">
          <span className="fr-icon-server-line" aria-hidden="true" />
          <strong>MCP IFC-Lite non configuré</strong>
          <p>
            Renseignez les variables <code>IFC_MCP_*</code>, puis redémarrez le
            service web.
          </p>
        </div>
      )}
    </section>
  );
}

function AssistantSession({
  assetId,
  config,
  history,
  onFinish,
  projectId,
}: {
  assetId: string;
  config: ReturnType<typeof AuiConfig>;
  history: AssistantThreadHistory;
  onFinish: (messages: UIMessage[]) => void;
  projectId: string;
}) {
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: `/api/projects/${projectId}/assistant`,
        body: { assetId, threadId: history.thread.id },
      }),
    [assetId, history.thread.id, projectId],
  );
  const runtime = useChatRuntime({
    id: history.thread.id,
    messages: history.messages as unknown as UIMessage[],
    onFinish: ({ isError, messages }) => {
      if (!isError) onFinish(messages);
    },
    transport,
  });

  return (
    <AssistantRuntimeProvider config={config} runtime={runtime}>
      <AssistantThread />
    </AssistantRuntimeProvider>
  );
}
