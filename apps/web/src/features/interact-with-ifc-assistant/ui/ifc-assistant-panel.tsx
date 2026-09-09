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
import type { IfcViewerController } from "@mnemo/ifc-viewer-adapter";
import { useMemo } from "react";
import remarkGfm from "remark-gfm";

import { createViewerToolActions } from "../model/viewer-tool-actions";
import { createViewerAssistantToolkit } from "../model/viewer-toolkit";

import styles from "./ifc-assistant-panel.module.css";

const suggestions = [
  "Quelles classes IFC et quels niveaux sont présents ?",
  "Affiche uniquement les murs en bleu.",
  "Sélectionne un élément et explique-moi ses propriétés.",
];

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
  mcpConfigured,
  projectId,
}: {
  assetId: string;
  configured: boolean;
  getViewer: () => IfcViewerController | null;
  hidden: boolean;
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
  const transport = useMemo(
    () =>
      new AssistantChatTransport({
        api: `/api/projects/${projectId}/assistant`,
        body: { assetId },
      }),
    [assetId, projectId],
  );
  const runtime = useChatRuntime({ transport });
  const config = AuiConfig({ tools: Tools({ toolkit }) });

  return (
    <section className={styles.panel} hidden={hidden}>
      {configured && mcpConfigured ? (
        <AssistantRuntimeProvider config={config} runtime={runtime}>
          <AssistantThread />
        </AssistantRuntimeProvider>
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
