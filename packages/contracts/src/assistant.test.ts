import { describe, expect, it } from "vitest";

import {
  assistantThreadHistorySchema,
  assistantThreadSummarySchema,
} from "./assistant";

const thread = {
  id: "00000000-0000-4000-8000-000000000030",
  projectId: "00000000-0000-4000-8000-000000000010",
  assetId: "00000000-0000-4000-8000-000000000020",
  title: "Murs du niveau 1",
  createdAt: "2026-09-09T10:00:00.000Z",
  updatedAt: "2026-09-09T10:05:00.000Z",
};

describe("assistant contracts", () => {
  it("validates a thread summary", () => {
    expect(assistantThreadSummarySchema.parse(thread)).toEqual(thread);
  });

  it("preserves AI SDK message parts used by assistant-ui", () => {
    const history = assistantThreadHistorySchema.parse({
      thread,
      messages: [
        {
          id: "message-1",
          role: "assistant",
          metadata: { modelId: "google/gemini-3.7-flash" },
          parts: [
            { type: "text", text: "Voici les murs." },
            {
              type: "dynamic-tool",
              toolName: "query_elements",
              toolCallId: "call-1",
              state: "output-available",
              input: { ifcClass: "IfcWall" },
              output: { count: 12 },
            },
          ],
        },
      ],
    });

    expect(history.messages[0]?.parts).toHaveLength(2);
    expect(history.messages[0]?.metadata).toEqual({
      modelId: "google/gemini-3.7-flash",
    });
  });
});
