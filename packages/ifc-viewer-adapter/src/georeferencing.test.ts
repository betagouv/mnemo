import type { GeoreferenceInfo } from "@ifc-lite/parser";
import { describe, expect, it } from "vitest";

import { classifyIfcGeoreferencing } from "./georeferencing";

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
});
