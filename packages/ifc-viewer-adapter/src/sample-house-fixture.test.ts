import { readFile } from "node:fs/promises";

import {
  createSectionConfig,
  Drawing2DGenerator,
  generateFloorPlan,
} from "@ifc-lite/drawing-2d";
import { extractFloorPlanOutline } from "./floor-plan-outline";
import type { MeshData } from "@ifc-lite/geometry";
import { GeometryProcessor } from "@ifc-lite/geometry";
import { IfcParser } from "@ifc-lite/parser";
import { expect, it } from "vitest";
import { generateFloorPlanDrawing } from "./floor-plan-computation";
import { intersectsFloorPlan } from "./floor-plan-meshes";
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
  const elevation = level.elevation! + 1.2 - originZ;
  const selected = meshes.filter((mesh) =>
    intersectsFloorPlan(mesh, elevation),
  );
  const filtered = await generateFloorPlan(selected, elevation, {
    includeProjection: true,
    includeHiddenLines: false,
  });
  const bounded = await generateFloorPlanDrawing(selected, elevation);
  expect(bounded.lines.filter((line) => line.category === "cut")).toEqual(
    filtered.lines.filter((line) => line.category === "cut"),
  );
  expect(bounded.lines.every((line) => line.visibility !== "hidden")).toBe(
    true,
  );
  expect(bounded.cutPolygons).toEqual(filtered.cutPolygons);
  expect(filtered.lines).toEqual(drawing.lines);
  expect(filtered.cutPolygons).toEqual(drawing.cutPolygons);
  const reference = new Drawing2DGenerator();
  try {
    await reference.initialize();
    for (const storey of levels) {
      if (storey.elevation === null) continue;
      const cutElevation = storey.elevation + 1.2 - originZ;
      const levelMeshes = meshes.filter((mesh) =>
        intersectsFloorPlan(mesh, cutElevation),
      );
      const withOverhead = await reference.generate(
        levelMeshes,
        createSectionConfig("y", cutElevation, {
          projectionDepth: 3,
          clipProjectionBands: true,
        }),
        {
          includeProjection: true,
          includeHiddenLines: false,
          outlineProvider: extractFloorPlanOutline,
        },
      );
      const visibleOnly = await generateFloorPlanDrawing(
        levelMeshes,
        cutElevation,
      );
      expect(
        visibleOnly.lines.filter((line) => line.category === "cut"),
        storey.name,
      ).toEqual(withOverhead.lines.filter((line) => line.category === "cut"));
      expect(visibleOnly.cutPolygons, storey.name).toEqual(
        withOverhead.cutPolygons,
      );
    }
  } finally {
    reference.dispose();
  }
  expect(drawing.stats.cutLineCount).toBeGreaterThan(0);
  expect(
    drawing.lines.every(({ line }) =>
      [line.start.x, line.start.y, line.end.x, line.end.y].every(
        Number.isFinite,
      ),
    ),
  ).toBe(true);
}, 30_000);
