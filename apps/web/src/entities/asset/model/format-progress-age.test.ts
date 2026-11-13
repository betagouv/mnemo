import { describe, expect, it } from "vitest";
import { formatProgressAge } from "./format-progress-age";

describe("formatProgressAge", () => {
  const updatedAt = "2026-11-13T12:00:00.000Z";
  const timestamp = Date.parse(updatedAt);

  it.each([
    [-30, "à l'instant"],
    [0, "à l'instant"],
    [59, "à l'instant"],
    [60, "il y a 1 minute"],
    [119, "il y a 1 minute"],
    [120, "il y a 2 minutes"],
    [3_600, "il y a 1 heure"],
    [7_200, "il y a 2 heures"],
    [86_400, "il y a 1 jour"],
    [172_800, "il y a 2 jours"],
  ])("formats an elapsed duration of %i seconds", (seconds, expected) => {
    expect(formatProgressAge(updatedAt, timestamp + seconds * 1_000)).toBe(
      expected,
    );
  });

  it("handles explicit timezone offsets", () => {
    expect(
      formatProgressAge("2026-11-13T13:00:00+01:00", timestamp + 120_000),
    ).toBe("il y a 2 minutes");
  });
});
