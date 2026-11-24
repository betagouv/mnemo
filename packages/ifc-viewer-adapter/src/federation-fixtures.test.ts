import { readFile } from "node:fs/promises";
import {
  GeometryProcessor,
  type CoordinateInfo,
  type MeshData,
} from "@ifc-lite/geometry";
import { renderFrameWorldOffset } from "@ifc-lite/geometry/world-frame";
import { extractGeoreferencingOnDemand, IfcParser } from "@ifc-lite/parser";
import type { ProjectMapReference } from "@mnemo/contracts/map-reference";
import { expect, it } from "vitest";

import { ProjectFrame } from "./project-frame";
import { createScenePlacement, projectOrigin } from "./scene-placement";

const fixtures = new URL(
  "../../../apps/web/tests/fixtures/federation/",
  import.meta.url,
);
// Five descriptions of the same 8 m × 0.2 m × 2 m wall, returning at right angles
// from the end of the reference wall.
const returns = [
  "02-lambert93",
  "03-lambert93-rotated",
  "04-rgf93-cc49",
  "05-utm31n",
  "06-absolute-coordinates",
];

async function read(name: string, edit = (source: string) => source) {
  const text = edit(await readFile(new URL(`${name}.ifc`, fixtures), "utf8"));
  const source = new TextEncoder().encode(text);
  const store = await new IfcParser().parseColumnar(source.buffer);
  const geometry = new GeometryProcessor();
  const meshes: MeshData[] = [];
  let coordinateInfo: CoordinateInfo | undefined;
  try {
    await geometry.init();
    for await (const event of geometry.processAdaptive(source)) {
      if (event.type === "batch") meshes.push(...event.meshes);
      if (event.type === "complete") coordinateInfo = event.coordinateInfo;
    }
  } finally {
    geometry.dispose();
  }
  return {
    assetId: name,
    georeference: extractGeoreferencingOnDemand(store),
    lengthUnitScale: store.lengthUnitScale,
    rtc: renderFrameWorldOffset(coordinateInfo),
    meshes,
  };
}

/** Bounds in project coordinates, and the largest vertex kept in f32. */
async function position(
  frame: ProjectFrame,
  model: Awaited<ReturnType<typeof read>>,
) {
  const { transform, issues } = await frame.position(model);
  const origin = projectOrigin(transform, model.rtc);
  const placement = createScenePlacement(transform, model.rtc, origin);
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const mesh of model.meshes.map(placement.place))
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const [x, y, z] = [0, 1, 2].map(
        (axis) => mesh.positions[i + axis]! + (mesh.origin?.[axis] ?? 0),
      );
      const project = [x! + origin.x, origin.y - z!, y! + origin.z];
      project.forEach((value, axis) => {
        min[axis] = Math.min(min[axis]!, value);
        max[axis] = Math.max(max[axis]!, value);
      });
    }
  return { min, max, issues, placement };
}

function expectClose(actual: number[], expected: number[]) {
  actual.forEach((value, axis) =>
    expect(Math.abs(value - expected[axis]!)).toBeLessThan(0.0005),
  );
}

it("superimposes Lambert-93, CC49, UTM and absolute models within half a millimetre", async () => {
  const frame = new ProjectFrame();
  const reference = await position(frame, await read("01-reference-lambert93"));
  expectClose(reference.min, [0, 0, 0]);
  expectClose(reference.max, [12, 0.2, 3]);
  for (const name of returns) {
    const wall = await position(frame, await read(name));
    expect(wall.issues, name).toEqual([]);
    expectClose(wall.min, [11.8, 0, 0]);
    expectClose(wall.max, [12, 8, 2]);
  }
}, 60_000);

it("keeps project coordinates when models load in another order", async () => {
  let pinned: ProjectMapReference | null = null;
  const pin = async (candidate: ProjectMapReference) => (pinned ??= candidate);
  await position(
    new ProjectFrame({ pin }),
    await read("01-reference-lambert93"),
  );
  for (const name of returns) {
    // A new session in which the reference has not loaded, or failed to.
    const wall = await position(
      new ProjectFrame({ reference: pinned, pin }),
      await read(name),
    );
    expectClose(wall.min, [11.8, 0, 0]);
    expectClose(wall.max, [12, 8, 2]);
  }
}, 60_000);

it("converts storey elevations with the model", async () => {
  const frame = new ProjectFrame();
  await position(frame, await read("01-reference-lambert93"));
  const model = await read("03-lambert93-rotated");
  const { transform } = await frame.position(model);
  const { elevation } = createScenePlacement(transform, model.rtc, {
    x: 0,
    y: 0,
    z: 0,
  });
  // The authored storey is at 7 m above a conversion that is 7 m lower.
  expect(elevation(7)).toBeCloseTo(0, 6);
}, 60_000);

it("warns about models that cannot be positioned and leaves them as authored", async () => {
  const frame = new ProjectFrame();
  await position(frame, await read("01-reference-lambert93"));
  const local = await position(
    frame,
    await read("02-lambert93", (ifc) =>
      ifc.replace(/#3[67]=IFC(PROJECTEDCRS|MAPCONVERSION).*;/g, ""),
    ),
  );
  expect(local.issues).toEqual(["no-georeference"]);
  expect(local.placement.moves).toBe(false);
  const unknown = await position(
    frame,
    await read("02-lambert93", (ifc) =>
      ifc.replace("'EPSG:2154'", "'Repère du chantier'"),
    ),
  );
  expect(unknown.issues).toEqual(["unknown-crs"]);
}, 60_000);

it("recognises a model authored at map coordinates without a conversion", async () => {
  const frame = new ProjectFrame();
  await position(frame, await read("01-reference-lambert93"));
  const absolute = await position(
    frame,
    await read("06-absolute-coordinates", (ifc) =>
      ifc.replace(/#3[67]=IFC(PROJECTEDCRS|MAPCONVERSION).*;/g, ""),
    ),
  );
  expect(absolute.issues).toEqual(["assumed-map-coordinates"]);
  expectClose(absolute.min, [11.8, 0, 0]);
}, 60_000);
