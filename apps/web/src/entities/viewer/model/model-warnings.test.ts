import { describe, expect, it } from "vitest";
import {
  describeModelWarnings,
  summarizeModelWarnings,
} from "./model-warnings";

const local = {
  fileName: "Local.ifc",
  positioningIssues: ["no-georeference" as const],
};

describe("model warnings", () => {
  it("does not warn about a single local model", () => {
    expect(describeModelWarnings(local, 1)).toEqual([]);
    expect(summarizeModelWarnings([local])).toBe("");
  });

  it("warns when a local model is superimposed with another", () => {
    expect(
      summarizeModelWarnings([{ fileName: "Aligné.ifc" }, local]),
    ).toContain("Local.ifc : Aucun géoréférencement");
  });

  it("names the coordinate system that could not be used", () => {
    expect(
      describeModelWarnings(
        {
          fileName: "Chantier.ifc",
          georeferencing: { kind: "projected", crs: "Repère chantier" },
          positioningIssues: ["unknown-crs"],
        },
        1,
      )[0],
    ).toContain("« Repère chantier »");
  });

  it("reports geometry that could not be computed", () => {
    expect(
      describeModelWarnings({ fileName: "Lourd.ifc", skippedElements: 2 }, 1),
    ).toEqual(["2 élément(s) trop longs à calculer ne sont pas affichés."]);
  });

  it("keeps the notification short for large projects", () => {
    const summary = summarizeModelWarnings(
      Array.from({ length: 5 }, (_, index) => ({
        ...local,
        fileName: `${index}.ifc`,
      })),
    );
    expect(summary).toContain("2.ifc");
    expect(summary).not.toContain("3.ifc");
    expect(summary).toContain("2 autre(s) maquette(s)");
  });
});
