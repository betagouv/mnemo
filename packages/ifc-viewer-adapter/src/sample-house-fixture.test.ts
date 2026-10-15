import { readFile } from "node:fs/promises";

import { GeometryProcessor } from "@ifc-lite/geometry";
import { IfcParser } from "@ifc-lite/parser";
import { expect, it } from "vitest";

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
  try {
    await geometry.init();
    for await (const event of geometry.processAdaptive(
      new Uint8Array(source),
    )) {
      if (event.type === "batch") meshCount += event.meshes.length;
    }
  } finally {
    geometry.dispose();
  }
  expect(meshCount).toBe(223);
}, 30_000);
