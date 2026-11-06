import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { checkArchitecture } from "./architecture-boundaries.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const violations = await checkArchitecture(
  resolve(repositoryRoot, "apps/web/src"),
);
if (violations.length) {
  console.error("Architecture boundary violations:\n");
  console.error(violations.map((violation) => `- ${violation}`).join("\n"));
  process.exitCode = 1;
} else console.log("Feature-Sliced Design and server boundaries are valid.");
