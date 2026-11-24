import { applySpatialPlacement, type MeshData } from "@ifc-lite/geometry";
import type { ProjectMapReference } from "@mnemo/contracts/map-reference";
import { describe, expect, it, vi } from "vitest";

import type { IfcGeoreference } from "./georeferencing";
import { ProjectFrame } from "./project-frame";

const asset = (digit: number) => `00000000-0000-4000-8000-00000000000${digit}`;
const origin = { x: 0, y: 0, z: 0 };

function georeference(
  name = "EPSG:2154",
  conversion: Partial<NonNullable<IfcGeoreference["mapConversion"]>> = {},
  verticalDatum?: string,
): IfcGeoreference {
  return {
    source: "mapConversion",
    projectedCRS: { name, verticalDatum },
    mapConversion: {
      eastings: 652310,
      northings: 6862414,
      orthogonalHeight: 42,
      ...conversion,
    },
  };
}
function model(
  id: number,
  georef: IfcGeoreference | null,
  rtc = origin,
): Parameters<ProjectFrame["position"]>[0] {
  return {
    assetId: asset(id),
    georeference: georef,
    lengthUnitScale: 1,
    rtc,
    meshes: [{ positions: new Float32Array([0, 0, 0]) } as unknown as MeshData],
  };
}

describe("project frame", () => {
  it("persists the first georeferenced model and keeps its coordinates", async () => {
    const pin = vi.fn(async (value: ProjectMapReference) => value);
    const frame = new ProjectFrame({ pin });
    expect(frame.keepsAuthoredCoordinates(asset(1))).toBe(true);
    expect(await frame.position(model(1, georeference()))).toEqual({
      transform: null,
      issues: [],
    });
    await frame.position(model(2, georeference()));
    expect(pin).toHaveBeenCalledOnce();
    expect(pin.mock.calls[0]![0]).toMatchObject({
      assetId: asset(1),
      crs: "EPSG:2154",
      eastings: 652310,
    });
    expect(frame.keepsAuthoredCoordinates(asset(1))).toBe(true);
    expect(frame.keepsAuthoredCoordinates(asset(2))).toBe(false);
  });

  it("uses the frame that another session persisted first", async () => {
    const frame = new ProjectFrame({
      pin: async (value) => ({
        ...value,
        assetId: asset(9),
        eastings: 652300,
      }),
    });
    const { transform } = await frame.position(model(1, georeference()));
    expect(applySpatialPlacement(transform!, 0, 0, 0)[0]).toBeCloseTo(10, 9);
  });

  it("keeps the first coordinates when a conversion cannot be read identically", async () => {
    const frame = new ProjectFrame();
    await frame.position(model(1, georeference()));
    // The Rust and browser engines may round the same file differently.
    expect(
      await frame.position(
        model(1, georeference(undefined, { eastings: 652310 + 1e-7 })),
      ),
    ).toEqual({ transform: null, issues: [] });
  });

  it("lets models already shown at map coordinates define the frame", async () => {
    const pin = vi.fn(async (value: ProjectMapReference) => value);
    const frame = new ProjectFrame({ pin });
    await frame.position(model(1, null, { x: 652300, y: 6862400, z: 40 }));
    const { transform } = await frame.position(model(2, georeference()));
    expect(pin.mock.calls[0]![0]).toMatchObject({
      assetId: null,
      eastings: 0,
      northings: 0,
    });
    const [east, up, south] = applySpatialPlacement(transform!, 0, 0, 0);
    expect([east, up, -south]).toEqual([652310, 42, 6862414]);
  });

  it("does not apply a conversion that the geometry already includes", async () => {
    const frame = new ProjectFrame();
    await frame.position(model(1, georeference()));
    const { transform, issues } = await frame.position(
      model(2, georeference(undefined, { orthogonalHeight: 0 }), {
        x: 652320,
        y: 6862414,
        z: 42,
      }),
    );
    expect(issues).toEqual(["assumed-map-coordinates"]);
    const placed = applySpatialPlacement(transform!, 652320, 42, -6862414);
    placed.forEach((value, axis) =>
      expect(value).toBeCloseTo([10, 0, 0][axis]!, 6),
    );
  });

  it("reports declared height systems that differ", async () => {
    const frame = new ProjectFrame();
    await frame.position(model(1, georeference("EPSG:2154", {}, "NGF-IGN69")));
    expect(
      (
        await frame.position(
          model(2, georeference("EPSG:2154", {}, "ngf-ign69")),
        )
      ).issues,
    ).toEqual([]);
    expect(
      (await frame.position(model(3, georeference("EPSG:2154")))).issues,
    ).toEqual([]);
    expect(
      (await frame.position(model(4, georeference("EPSG:2154", {}, "RAF20"))))
        .issues,
    ).toEqual(["different-vertical-datum"]);
  });

  it("aligns legacy datums without their grid and reports the accuracy", async () => {
    const frame = new ProjectFrame();
    await frame.position(model(1, georeference()));
    // Notre-Dame de Paris in Lambert-93 and Lambert II étendu.
    const { transform, issues } = await frame.position(
      model(
        2,
        georeference("EPSG:27572", { eastings: 600968, northings: 2428560 }),
      ),
    );
    expect(issues).toEqual(["approximate-datum"]);
    const [east, up, south] = applySpatialPlacement(transform!, 0, 0, 0);
    expect(Math.hypot(east, south)).toBeLessThan(2_000);
    expect(up).toBeCloseTo(0, 9);
  });

  it.each([
    ["no-georeference", null],
    ["site-only", { ...georeference("EPSG:4326"), source: "siteLocation" }],
    ["invalid-conversion", georeference("EPSG:2154", { eastings: NaN })],
    [
      "invalid-conversion",
      georeference("EPSG:2154", { xAxisAbscissa: 0, xAxisOrdinate: 0 }),
    ],
    ["unknown-crs", georeference("Repère du chantier")],
    ["unknown-crs", georeference("EPSG:4326", { eastings: 2.35 })],
  ] as const)(
    "reports %s and keeps authored coordinates",
    async (issue, geo) => {
      const frame = new ProjectFrame();
      await frame.position(model(1, georeference()));
      expect(
        await frame.position(model(2, geo as IfcGeoreference | null)),
      ).toEqual({ transform: null, issues: [issue] });
    },
  );

  it("never uses a placeholder conversion, whichever model loads first", async () => {
    const pin = vi.fn(async (value: ProjectMapReference) => value);
    const frame = new ProjectFrame({ pin });
    const placeholder = georeference("EPSG:2154", {
      eastings: 0,
      northings: 0,
    });
    const kept = { transform: null, issues: ["out-of-area"] };
    expect(await frame.position(model(1, placeholder))).toEqual(kept);
    expect(pin).not.toHaveBeenCalled();
    await frame.position(model(2, georeference()));
    expect(pin.mock.calls[0]![0].assetId).toBe(asset(2));
    expect(await frame.position(model(3, placeholder))).toEqual(kept);
  });

  it("accepts a conical zone used slightly outside its band", async () => {
    const frame = new ProjectFrame();
    // Paris in CC48, whose band stops at 49°N.
    expect(
      await frame.position(
        model(
          1,
          georeference("EPSG:3948", { eastings: 1652000, northings: 7295000 }),
        ),
      ),
    ).toEqual({ transform: null, issues: [] });
  });

  it("never persists an unknown grid but aligns the models that share it", async () => {
    const pin = vi.fn(async (value: ProjectMapReference) => value);
    const frame = new ProjectFrame({ pin });
    const grid = (eastings: number) =>
      georeference("Repère du chantier", { eastings });
    await frame.position(model(1, grid(100)));
    const { transform, issues } = await frame.position(model(2, grid(130)));
    expect(pin).not.toHaveBeenCalled();
    expect(issues).toEqual(["unknown-crs"]);
    expect(applySpatialPlacement(transform!, 0, 0, 0)[0]).toBe(30);
  });
});
