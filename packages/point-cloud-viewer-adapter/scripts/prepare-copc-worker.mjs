import { createRequire } from "node:module";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const outputDirectory = process.argv[2];
if (!outputDirectory) {
  throw new Error("Usage: prepare-copc-worker.mjs <public-directory>");
}

const packageEntry = fileURLToPath(import.meta.resolve("@ifc-lite/pointcloud"));
const packageRequire = createRequire(packageEntry);
const inlineWorkerPath = join(
  dirname(packageEntry),
  "streaming/inline-worker.js",
);
const { INLINE_WORKER_CODE } = await import(
  pathToFileURL(inlineWorkerPath).href
);
const unresolvedWasmImport = 'import("laz-perf/lib/web/laz-perf.wasm?url")';
if (!INLINE_WORKER_CODE || !INLINE_WORKER_CODE.includes(unresolvedWasmImport)) {
  throw new Error(
    "The IFC-Lite decode worker changed; review its WASM asset integration",
  );
}

// IFC-Lite's published inline worker retains a Vite-only `?url` import. A
// Blob worker cannot resolve that bare import in Next.js. Serve its bundled
// code and laz-perf WASM as same-origin static assets instead.
const workerCode = INLINE_WORKER_CODE.replace(
  unresolvedWasmImport,
  'Promise.resolve({ default: "/pointcloud/laz-perf.wasm" })',
);
const wasmPath = packageRequire.resolve("laz-perf/lib/web/laz-perf.wasm");
const target = join(outputDirectory, "pointcloud");
await mkdir(target, { recursive: true });
await Promise.all([
  writeFile(join(target, "decode-worker.js"), workerCode),
  copyFile(wasmPath, join(target, "laz-perf.wasm")),
]);
