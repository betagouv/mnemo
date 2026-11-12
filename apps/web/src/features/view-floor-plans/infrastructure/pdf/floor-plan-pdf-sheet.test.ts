import { readFile } from "node:fs/promises";
import { jsPDF } from "jspdf";
import { describe, expect, it, vi } from "vitest";
import { createFloorPlanStyleResolver } from "@mnemo/ifc-viewer-adapter";
import { drawFloorPlanSheet, floorPlanPdfLayout } from "./floor-plan-pdf-sheet";

describe("floor plan PDF sheets", () => {
  it.each([
    [420, 297, 18, 10],
    [297, 420, 8, 30],
    [420, 297, 1, 0.1],
    [420, 297, 100000, 80000],
  ])(
    "keeps the drawing inside its frame at an exact labelled scale",
    (width, height, worldWidth, worldHeight) => {
      const layout = floorPlanPdfLayout(width, height, worldWidth, worldHeight);
      expect(worldWidth * layout.scale).toBeLessThanOrEqual(layout.plot.width);
      expect(worldHeight * layout.scale).toBeLessThanOrEqual(
        layout.plot.height,
      );
      expect(layout.scale * layout.denominator).toBeCloseTo(1000);
      expect(layout.plot.width).toBe(width - 24);
      expect(layout.legendY).toBeGreaterThan(
        layout.plot.y + layout.plot.height,
      );
    },
  );
  it.each(["landscape", "portrait"] as const)(
    "paginates long legends on %s sheets",
    async (orientation) => {
      const pdf = new jsPDF({ orientation, unit: "mm", format: "a3" });
      const write = vi.spyOn(pdf, "text");
      const style = createFloorPlanStyleResolver(
        { getElementProperties: () => ({}) },
        "default",
      )({ entityId: 1, ifcType: "IfcWall" });
      const layout = floorPlanPdfLayout(
        pdf.internal.pageSize.getWidth(),
        pdf.internal.pageSize.getHeight(),
        10,
        10,
        130,
      );
      drawFloorPlanSheet(
        pdf,
        {
          title: "Une vue au nom très long ".repeat(30),
          projectName: "Projet de test ".repeat(30),
          sourceName: "maquette-".repeat(50) + ".ifc",
          storeyName: "Rez-de-chaussée",
          storeyElevation: 0,
          verticalDatum: "NGF-IGN69",
          logo: await readFile(
            new URL(
              "../../../../../public/mnemo-operator.png",
              import.meta.url,
            ),
          ),
          exportedAt: new Date("2026-11-05T19:00:00Z"),
        },
        Array.from({ length: 130 }, (_, index) => ({
          label: `Règle ${index + 1} ` + "très longue ".repeat(10),
          detail: "IfcWall · coupe · 0,35 mm",
          style,
          filled: true,
        })),
        layout,
      );
      expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
      expect(pdf.getNumberOfPages()).toBeLessThanOrEqual(4);
      expect(pdf.output()).not.toMatch(/NaN|Infinity/);
      const printedText = write.mock.calls
        .flatMap(([value]) => (Array.isArray(value) ? value : [value]))
        .join("\n");
      expect(printedText).toContain("Coupe à +1 m");
      expect(printedText).toContain("Altitude relative IFC ±0,00 m");
      expect(printedText).toContain("Référentiel du fichier NGF-IGN69");
    },
  );
});
