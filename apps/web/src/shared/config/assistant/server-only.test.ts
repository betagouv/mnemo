import { describe, expect, it } from "vitest";

import { readAssistantConfiguration } from "./server-only";

describe("assistant configuration", () => {
  it("uses Gemini 3.7 Flash by default without exposing an empty key", () => {
    expect(readAssistantConfiguration({})).toBeNull();
    expect(
      readAssistantConfiguration({ OPENROUTER_API_KEY: "  secret  " }),
    ).toEqual({
      apiKey: "secret",
      model: "google/gemini-3.7-flash",
    });
  });

  it("accepts explicit model and application attribution", () => {
    expect(
      readAssistantConfiguration({
        OPENROUTER_API_KEY: "secret",
        OPENROUTER_MODEL: "google/gemini-3.8-flash",
        OPENROUTER_APP_URL: "https://mnemo.example.fr",
      }),
    ).toEqual({
      apiKey: "secret",
      model: "google/gemini-3.8-flash",
      appUrl: "https://mnemo.example.fr",
    });
  });
});
