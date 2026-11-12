import type { GeoreferenceInfo } from "@ifc-lite/parser";
import { describe, expect, it } from "vitest";

import {
  classifyIfcGeoreferencing,
  classifyServerIfcGeoreferencing,
} from "./georeferencing";

describe("classifyIfcGeoreferencing", () => {
  it("does not confuse site coordinates with a project map conversion", () => {
    expect(
      classifyIfcGeoreferencing({
        hasGeoreference: true,
        source: "siteLocation",
        projectedCRS: { id: 1, name: "EPSG:4326" },
        mapConversion: {
          id: 2,
          sourceCRS: 1,
          targetCRS: 1,
          eastings: 0,
          northings: 0,
          orthogonalHeight: 0,
        },
      } satisfies GeoreferenceInfo),
    ).toEqual({ kind: "site-only", crs: null });
  });

  it("recognizes an explicit projected map conversion", () => {
    expect(
      classifyIfcGeoreferencing({
        hasGeoreference: true,
        source: "mapConversion",
        projectedCRS: { id: 2, name: "EPSG:2154" },
        mapConversion: {
          id: 3,
          sourceCRS: 1,
          targetCRS: 2,
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

  const projected: GeoreferenceInfo = {
    hasGeoreference: true,
    source: "mapConversion",
    projectedCRS: {
      id: 2,
      name: "EPSG:2154",
      verticalDatum: "NGF-IGN69",
    },
    mapConversion: {
      id: 3,
      sourceCRS: 1,
      targetCRS: 2,
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
    expect(classifyServerIfcGeoreferencing(geo)).toEqual(
      classifyIfcGeoreferencing(projected),
    );
    expect(
      classifyServerIfcGeoreferencing({ ...geo, source: "siteLocation" }),
    ).toEqual({ kind: "site-only", crs: null });
    expect(classifyServerIfcGeoreferencing(undefined)).toEqual({
      kind: "local",
      crs: null,
    });
  });
});
