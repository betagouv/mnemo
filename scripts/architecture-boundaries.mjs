import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import ts from "typescript";

const layers = ["app", "screens", "widgets", "features", "entities", "shared"];
const slicedLayers = new Set(["screens", "widgets", "features", "entities"]);
const extensions = [".ts", ".tsx", ".mts"];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory()
          ? sourceFiles(path)
          : extensions.some((extension) => path.endsWith(extension))
            ? [path]
            : [];
      }),
    )
  ).flat();
}

function parseModule(path, source) {
  const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const imports = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = node.importClause;
      const named = clause?.namedBindings;
      const typeOnly =
        node.isTypeOnly ||
        clause?.isTypeOnly ||
        (!clause?.name &&
          named &&
          ts.isNamedImports(named) &&
          named.elements.every((element) => element.isTypeOnly));
      imports.push({
        specifier: node.moduleSpecifier.text,
        typeOnly: Boolean(typeOnly),
      });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push({ specifier: node.arguments[0].text, typeOnly: false });
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const directives = new Set();
  for (const statement of ast.statements) {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isStringLiteral(statement.expression)
    )
      break;
    directives.add(statement.expression.text);
  }
  return {
    imports,
    client: directives.has("use client"),
    action: directives.has("use server"),
    serverOnly: imports.some((item) => item.specifier === "server-only"),
  };
}

function parts(root, path) {
  return relative(root, path).split(sep);
}
function localTarget(root, file, specifier, modules) {
  const base = specifier.startsWith("@/")
    ? resolve(root, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(file), specifier)
      : null;
  if (!base) return null;
  const stem = base.replace(/\.m?js$/, "");
  return (
    [
      base,
      ...extensions.map((extension) => stem + extension),
      ...extensions.map((extension) => join(base, "index" + extension)),
    ].find((candidate) => modules.has(candidate)) ?? null
  );
}

/** Check local imports after resolving aliases, relative paths and barrel exports. */
export async function checkArchitecture(sourceRoot) {
  const root = resolve(sourceRoot);
  const modules = new Map(
    await Promise.all(
      (await sourceFiles(root)).map(async (file) => [
        file,
        parseModule(file, await readFile(file, "utf8")),
      ]),
    ),
  );
  const clients = new Set(
    [...modules].filter(([, module]) => module.client).map(([file]) => file),
  );
  const pending = [...clients];
  while (pending.length) {
    const file = pending.pop();
    for (const edge of modules.get(file).imports) {
      if (edge.typeOnly) continue;
      const target = localTarget(root, file, edge.specifier, modules);
      if (!target || modules.get(target).action || clients.has(target))
        continue;
      clients.add(target);
      pending.push(target);
    }
  }
  const violations = [];
  for (const [file, module] of modules) {
    if (clients.has(file) && module.serverOnly)
      violations.push(
        `${relative(root, file)}: server-only module is reachable from a client component`,
      );
    for (const edge of module.imports) {
      const target = localTarget(root, file, edge.specifier, modules);
      const sourceParts = parts(root, file),
        targetParts = target ? parts(root, target) : [];
      const sourceLayer = sourceParts[0],
        targetLayer = targetParts[0];
      let reason;
      if (
        clients.has(file) &&
        /^@mnemo\/(database|storage|processing-worker)(\/|$)/.test(
          edge.specifier,
        )
      )
        reason = "client modules cannot import server runtime packages";
      else if (
        clients.has(file) &&
        targetLayer === "server" &&
        !modules.get(target).action
      )
        reason =
          "client modules may access server code only through Server Actions; put public DTOs in contracts";
      else if (
        sourceLayer === "server" &&
        targetLayer &&
        layers.includes(targetLayer) &&
        targetLayer !== "shared"
      )
        reason = "server modules cannot depend on frontend slices";
      else if (
        sourceLayer === "server" &&
        sourceParts[2] === "application" &&
        targetLayer === "server" &&
        targetParts[2] === "infrastructure"
      )
        reason =
          "application use cases must depend on ports; wire infrastructure in factories";
      else if (layers.includes(sourceLayer) && layers.includes(targetLayer)) {
        const sameSlice =
          sourceLayer === targetLayer && sourceParts[1] === targetParts[1];
        if (layers.indexOf(targetLayer) < layers.indexOf(sourceLayer))
          reason = `${sourceLayer} cannot import the higher ${targetLayer} layer`;
        else if (
          sourceLayer === targetLayer &&
          slicedLayers.has(sourceLayer) &&
          !sameSlice
        )
          reason = "sibling slices must be composed in a higher layer";
        else if (
          slicedLayers.has(targetLayer) &&
          !sameSlice &&
          !(
            targetParts.length === 3 &&
            /^index\.(ts|tsx|mts)$/.test(targetParts[2])
          )
        )
          reason = `import ${targetLayer}/${targetParts[1]} through its public index`;
      }
      if (reason)
        violations.push(
          `${relative(root, file)}: ${reason} (${edge.specifier})`,
        );
    }
  }
  return violations;
}
