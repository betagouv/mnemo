import { describe, expect, it } from "vitest";

import {
  classifyIfcGeoreferencing,
  fromServerGeoreferencing,
  readMapReference,
  type IfcGeoreference,
} from "./georeferencing";

describe("classifyIfcGeoreferencing", () => {
  it("does not confuse site coordinates with a project map conversion", () => {
    expect(
      classifyIfcGeoreferencing({
        source: "siteLocation",
        projectedCRS: { name: "EPSG:4326" },
        mapConversion: {
          eastings: 0,
          northings: 0,
          orthogonalHeight: 0,
        },
      } satisfies IfcGeoreference),
    ).toEqual({ kind: "site-only", crs: null });
  });

  it("recognizes an explicit projected map conversion", () => {
    expect(
      classifyIfcGeoreferencing({
        source: "mapConversion",
        projectedCRS: { name: "EPSG:2154" },
        mapConversion: {
          eastings: 700000,
          northings: 6600000,
          orthogonalHeight: 0,
        },
      }),
    ).toEqual({ kind: "projected", crs: "EPSG:2154" });
    expect(classifyIfcGeoreferencing(null)).toEqual({
      kind: "local",
      crs: null,
    });
  });

  const projected: IfcGeoreference = {
    source: "mapConversion",
    projectedCRS: {
      name: "EPSG:2154",
      verticalDatum: "NGF-IGN69",
    },
    mapConversion: {
      eastings: 700000,
      northings: 6600000,
      orthogonalHeight: 82,
    },
  };

  it("retains the declared vertical datum", () => {
    expect(classifyIfcGeoreferencing(projected)).toEqual({
      kind: "projected",
      crs: "EPSG:2154",
      verticalDatum: "NGF-IGN69",
    });
  });

  it("omits empty vertical datum names", () => {
    expect(
      classifyIfcGeoreferencing({
        ...projected,
        projectedCRS: { ...projected.projectedCRS!, verticalDatum: "  " },
      }),
    ).toEqual({ kind: "projected", crs: "EPSG:2154" });
  });

  it("classifies server and browser metadata consistently", () => {
    const geo = {
      source: "mapConversion",
      crs_name: "EPSG:2154",
      vertical_datum: " NGF-IGN69 ",
      eastings: 700000,
      northings: 6600000,
      orthogonal_height: 82,
      x_axis_abscissa: 1,
      x_axis_ordinate: 0,
      scale: 1,
      rotation_degrees: 0,
      transform_matrix: [],
    };
    expect(classifyIfcGeoreferencing(fromServerGeoreferencing(geo))).toEqual(
      classifyIfcGeoreferencing(projected),
    );
    expect(
      classifyIfcGeoreferencing(
        fromServerGeoreferencing({ ...geo, source: "siteLocation" }),
      ),
    ).toEqual({ kind: "site-only", crs: null });
    expect(
      classifyIfcGeoreferencing(fromServerGeoreferencing(undefined)),
    ).toEqual({
      kind: "local",
      crs: null,
    });
  });
});

describe("readMapReference", () => {
  const declare = (
    conversion: Partial<NonNullable<IfcGeoreference["mapConversion"]>>,
    mapUnitScale?: number,
  ): IfcGeoreference => ({
    source: "mapConversion",
    projectedCRS: { name: "EPSG:2154", mapUnitScale },
    mapConversion: {
      eastings: 652310,
      northings: 6862414,
      orthogonalHeight: 42,
      ...conversion,
    },
  });

  it.each([
    ["a metric project", declare({}), 1],
    ["a millimetre project with metric offsets", declare({}), 0.001],
    ["Scale bridging the units", declare({ scale: 0.001 }, 1), 0.001],
    ["Scale left at 1 in millimetres", declare({ scale: 1 }, 1), 0.001],
    ["a foot project", declare({ scale: 0.3048 }, 1), 0.3048],
    [
      "millimetre offsets with an explicit map unit",
      declare(
        {
          eastings: 652310000,
          northings: 6862414000,
          orthogonalHeight: 42000,
        },
        0.001,
      ),
      0.001,
    ],
    [
      "millimetre offsets following the project unit",
      declare({
        eastings: 652310000,
        northings: 6862414000,
        orthogonalHeight: 42000,
      }),
      0.001,
    ],
  ])("reads %s in metres", (_label, georeference, lengthUnitScale) => {
    const reference = readMapReference(georeference, lengthUnitScale)!;
    expect(reference.eastings).toBeCloseTo(652310, 6);
    expect(reference.northings).toBeCloseTo(6862414, 6);
    expect(reference.orthogonalHeight).toBeCloseTo(42, 6);
    expect(reference.scaleX).toBeCloseTo(1, 9);
    expect(reference.scaleZ).toBeCloseTo(1, 9);
  });

  it("keeps a grid scale factor and IfcMapConversionScaled factors", () => {
    expect(
      readMapReference(declare({ scale: 0.9996 }), 0.001)?.scaleX,
    ).toBeCloseTo(0.9996, 9);
    expect(
      readMapReference(declare({ factorX: 0.9996, factorY: 0.9996 }), 1),
    ).toMatchObject({ scaleX: 0.9996, scaleY: 0.9996, scaleZ: 1 });
  });

  it("rejects unusable conversions instead of substituting an origin", () => {
    expect(readMapReference(null)).toBeNull();
    expect(readMapReference(declare({ eastings: NaN }))).toBeNull();
    expect(readMapReference(declare({ scale: -1 }))).toBeNull();
    expect(
      readMapReference({ ...declare({}), source: "siteLocation" }),
    ).toBeNull();
  });
});
