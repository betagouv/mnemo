import { copyFile, cp, mkdir, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const template = join(repoRoot, "infrastructure/scalingo-octree");
const dist = join(repoRoot, "apps/processing-worker/dist");
const output = process.argv[2] && resolve(process.argv[2]);

if (!output) {
  throw new Error(
    "Usage: node apps/processing-worker/scripts/package-scalingo.mjs <empty-output-directory>",
  );
}
if ((await readdir(output).catch(() => [])).length) {
  throw new Error(
    "Output directory must be empty to avoid overwriting user files",
  );
}
if (!(await readdir(dist)).includes("process-point-cloud-once.js")) {
  throw new Error("Build @mnemo/processing-worker before packaging");
}

await mkdir(output, { recursive: true });
await cp(template, output, { recursive: true });
await mkdir(join(output, "dist"), { recursive: true });
await copyFile(
  join(dist, "process-point-cloud-once.js"),
  join(output, "dist/process-point-cloud-once.js"),
);
console.info(`Scalingo one-off source ready in ${output}`);
