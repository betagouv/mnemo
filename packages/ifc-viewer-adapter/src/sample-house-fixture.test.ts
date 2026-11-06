import { readFile } from "node:fs/promises";

import { generateFloorPlan } from "@ifc-lite/drawing-2d";
import type { MeshData } from "@ifc-lite/geometry";
import { GeometryProcessor } from "@ifc-lite/geometry";
import { IfcParser } from "@ifc-lite/parser";
import { expect, it } from "vitest";
import { createFloorPlanPdf } from "./floor-plan-pdf";
import { createIfcBimIndex } from "./bim-index";

const sampleHouse = new URL(
  "../../../apps/web/tests/fixtures/Ifc4_SampleHouse.ifc",
  import.meta.url,
);

it("parses the versioned SampleHouse fixture into 47,309 entities and 223 meshes", async () => {
  const bytes = await readFile(sampleHouse);
  const source = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const store = await new IfcParser().parseColumnar(source);
  expect(store.entityCount).toBe(47_309);

  const geometry = new GeometryProcessor();
  let meshCount = 0;
  const meshIds = new Set<number>();
  const meshes: MeshData[] = [];
  let originZ = 0;
  try {
    await geometry.init();
    for await (const event of geometry.processAdaptive(
      new Uint8Array(source),
    )) {
      if (event.type === "batch") {
        meshCount += event.meshes.length;
        meshes.push(...event.meshes);
        for (const mesh of event.meshes) meshIds.add(mesh.expressId);
      }
      if (event.type === "complete")
        originZ = event.coordinateInfo.wasmRtcOffset?.z ?? 0;
    }
  } finally {
    geometry.dispose();
  }
  expect(meshCount).toBe(223);
  const levels = createIfcBimIndex(store, [...meshIds]).catalog.storeys;
  expect(levels.length).toBeGreaterThan(0);
  expect(levels.every((level) => Number.isFinite(level.elevation))).toBe(true);
  const level = levels.find((item) => item.elevation !== null)!;
  const drawing = await generateFloorPlan(
    meshes,
    level.elevation! + 1.2 - originZ,
    {
      includeProjection: true,
      includeHiddenLines: false,
    },
  );
  const pdf = await createFloorPlanPdf(
    { ...drawing, getElementProperties: () => ({}) },
    "architectural",
    [],
    {
      title: "Rez-de-chaussée",
      projectName: "Projet de test",
      sourceName: "Ifc4_SampleHouse.ifc",
      storeyName: level.name,
      storeyElevation: level.elevation,
      logo: await readFile(
        new URL("../../../apps/web/public/mnemo-operator.png", import.meta.url),
      ),
      exportedAt: new Date("2026-11-05T19:00:00Z"),
    },
  );
  expect(pdf.size).toBeGreaterThan(1000);
  expect(new TextDecoder().decode((await pdf.arrayBuffer()).slice(0, 8))).toBe(
    "%PDF-1.3",
  );
  expect(drawing.stats.cutLineCount).toBeGreaterThan(0);
  expect(
    drawing.lines.every(({ line }) =>
      [line.start.x, line.start.y, line.end.x, line.end.y].every(
        Number.isFinite,
      ),
    ),
  ).toBe(true);
}, 30_000);
