import { expect, it } from "vitest";
import { resolveProjectedCrs } from "./coordinate-systems";

it.each([
  // France
  ["EPSG:2154", 2154],
  ["epsg 2154", 2154],
  ["2154", 2154],
  ["urn:ogc:def:crs:EPSG::2154", 2154],
  ["Lambert93", 2154],
  ["RGF93 / Lambert-93", 2154],
  ["RGF93-Lambert 93", 2154],
  ["CC42", 3942],
  ["RGF93 / CC49", 3949],
  ["RGF93 v1 / CC50", 3950],
  ["EPSG:9849", 9849],
  ["NTF (Paris) / Lambert zone II étendu", 27572],
  ["EPSG:27561", 27561],
  // Overseas
  ["RGAF09 / UTM zone 20N", 5490],
  ["RGFG95 / UTM zone 22N", 2972],
  ["RGR92 / UTM zone 40S", 2975],
  ["RGM04 / UTM zone 38S", 4471],
  // Neighbours and worldwide
  ["WGS 84 / UTM zone 31N", 32631],
  ["WGS84 / UTM 31N", 32631],
  ["ETRS89 / UTM zone 32N", 25832],
  ["BD72 / Belgian Lambert 72", 31370],
  // Not WGS 84: the datums are about 150 m apart.
  ["ED50 / UTM zone 31N", 23031],
  ["LV95", 2056],
  ["British National Grid", 27700],
  ["RD New", 28992],
  ["EPSG:3857", 3857],
  ["EPSG:2227", 2227],
])("resolves %s", async (name, epsg) => {
  expect((await resolveProjectedCrs(name))?.epsg).toBe(epsg);
});

it.each([
  "Repère du chantier",
  // Several datums share this projection.
  "UTM 31N",
  // Degrees are not a projected placement.
  "EPSG:4326",
  "",
])("leaves %j unresolved", async (name) => {
  expect(await resolveProjectedCrs(name)).toBeNull();
});
