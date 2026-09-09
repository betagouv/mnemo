import "server-only";

const defaultModel = "google/gemini-3.7-flash";

export type AssistantConfiguration = {
  apiKey: string;
  model: string;
  appUrl?: string;
};

export function readAssistantConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): AssistantConfiguration | null {
  const apiKey = environment.OPENROUTER_API_KEY?.trim();
  if (!apiKey) return null;

  const model = environment.OPENROUTER_MODEL?.trim() || defaultModel;
  const appUrl = environment.OPENROUTER_APP_URL?.trim();

  return {
    apiKey,
    model,
    ...(appUrl ? { appUrl } : {}),
  };
}

export function getAssistantConfiguration() {
  const configuration = readAssistantConfiguration(process.env);
  if (!configuration) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }
  return configuration;
}

export function isAssistantConfigured() {
  return readAssistantConfiguration(process.env) !== null;
}
