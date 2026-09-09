import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = join(repositoryRoot, "apps/web/src");
const sourceExtensions = new Set([".ts", ".tsx", ".mts"]);
const layers = ["app", "screens", "widgets", "features", "entities", "shared"];
const slicedLayers = new Set(["screens", "widgets", "features", "entities"]);
const importPatterns = [
  /\b(?:import|export)\s+(?:[^"'`]*?\sfrom\s*)?["']([^"']+)["']/g,
  /\bimport\(\s*["']([^"']+)["']\s*\)/g,
];

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        return collectSourceFiles(path);
      }

      return sourceExtensions.has(extname(entry.name)) ? [path] : [];
    }),
  );

  return nestedFiles.flat();
}

function getImports(source) {
  return importPatterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1]),
  );
}

function inspectImport(file, importPath) {
  if (!importPath.startsWith("@/")) {
    return null;
  }

  const sourceParts = relative(sourceRoot, file).split("/");
  const targetParts = importPath.slice(2).split("/");
  const sourceLayer = sourceParts[0];
  const targetLayer = targetParts[0];
  const sourceRank = layers.indexOf(sourceLayer);
  const targetRank = layers.indexOf(targetLayer);

  if (sourceRank === -1 || targetRank === -1) {
    return null;
  }

  if (targetRank < sourceRank) {
    return `${sourceLayer} cannot import the higher ${targetLayer} layer`;
  }

  if (!slicedLayers.has(targetLayer) || targetParts.length <= 2) {
    return null;
  }

  const sourceSlice = sourceParts[1];
  const targetSlice = targetParts[1];
  const staysInsideSlice =
    sourceLayer === targetLayer && sourceSlice === targetSlice;

  if (!staysInsideSlice) {
    return `import ${targetLayer}/${targetSlice} through its public index`;
  }

  return null;
}

const violations = [];

for (const file of await collectSourceFiles(sourceRoot)) {
  const source = await readFile(file, "utf8");

  for (const importPath of getImports(source)) {
    const reason = inspectImport(file, importPath);

    if (reason) {
      violations.push(
        `${relative(repositoryRoot, file)}: ${reason} (${importPath})`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error("Feature-Sliced Design boundary violations:\n");
  console.error(violations.map((violation) => `- ${violation}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("Feature-Sliced Design boundaries are valid.");
}
