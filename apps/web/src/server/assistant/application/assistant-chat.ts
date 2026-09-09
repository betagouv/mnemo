import { frontendTools, type FrontendTools } from "@assistant-ui/ai-sdk";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  type UIMessage,
  type ToolSet,
} from "ai";

import type { AssistantConfiguration } from "@/shared/config/assistant/server-only";

export const mnemoAssistantInstructions = `Tu es l’assistant BIM de Mnemo.

Tu travailles sur la maquette IFC actuellement ouverte. Tu dois utiliser les tools fournis pour lire ou modifier la vue et ne jamais inventer d’Express ID, de GlobalId, de classe IFC ou de niveau.

Règles d’utilisation de la visionneuse :
- appelle inspect_scene avant toute question ou action qui dépend de l’état de la maquette ;
- appelle query_elements quand l’utilisateur demande quels éléments correspondent à un critère ;
- exécute les tools de scène au lieu de seulement expliquer comment le faire ;
- pour une demande combinant plusieurs niveaux ou classes et plusieurs couleurs, fais un seul appel à set_scene_style avec plusieurs groupes ;
- mets focus à true pour « isoler », « afficher uniquement », « masque le reste » et, par défaut, pour une formulation impérative « affiche ... » qui désigne un sous-ensemble ;
- la transparence du contexte et son niveau sont exclusivement contrôlés par l’interface. Tu ne dois jamais proposer ni tenter de modifier l’opacité ;
- utilise des couleurs hexadécimales explicites ;
- réponds en français sauf demande contraire, de façon concise, et confirme les actions réellement exécutées.

Règles d’utilisation des tools IFC-Lite MCP :
- utilise-les pour les questions sémantiques précises : propriétés/Psets, quantités, relations, structure spatiale, matériaux, classification, géoréférencement et mesures géométriques ;
- commence par model_info ou spatial_hierarchy si la structure utile n’est pas encore connue ;
- le serveur MCP contient exactement une maquette autorisée : tu peux omettre model_id, ou employer l’identifiant renvoyé par model_info ;
- les tools MCP sont en lecture seule. Les actions visuelles doivent toujours passer par les tools de scène ;
- limite les listes, résume les résultats volumineux et indique lorsqu’un résultat est tronqué.`;

export type StreamAssistantChatInput = {
  configuration: AssistantConfiguration;
  messages: UIMessage[];
  tools: FrontendTools;
  mcpTools?: ToolSet;
};

export async function streamAssistantChat({
  configuration,
  messages,
  tools,
  mcpTools = {},
}: StreamAssistantChatInput) {
  const openrouter = createOpenRouter({
    apiKey: configuration.apiKey,
    appName: "Mnemo",
    ...(configuration.appUrl ? { appUrl: configuration.appUrl } : {}),
    compatibility: "strict",
  });
  const registeredTools: ToolSet = {
    ...frontendTools(tools),
    ...mcpTools,
  };
  const result = streamText({
    model: openrouter(configuration.model),
    system: mnemoAssistantInstructions,
    messages: await convertToModelMessages(messages),
    tools: registeredTools,
    stopWhen: stepCountIs(6),
    maxOutputTokens: 2_048,
    temperature: 0.2,
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      tools: registeredTools,
      onError: () =>
        "Le fournisseur IA n’a pas pu répondre. Vérifiez la clé OpenRouter et réessayez.",
      messageMetadata: ({ part }) =>
        part.type === "finish-step"
          ? { modelId: part.response.modelId }
          : undefined,
    }),
  });
}
