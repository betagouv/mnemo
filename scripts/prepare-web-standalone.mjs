import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const web = join(import.meta.dirname, "..", "apps", "web");
const standaloneWeb = join(web, ".next", "standalone", "apps", "web");

if (!existsSync(join(standaloneWeb, "server.js"))) {
  throw new Error(
    "Build the web application before preparing its standalone output",
  );
}

cpSync(join(web, ".next", "static"), join(standaloneWeb, ".next", "static"), {
  recursive: true,
});

if (existsSync(join(web, "public"))) {
  cpSync(join(web, "public"), join(standaloneWeb, "public"), {
    recursive: true,
  });
}

// The standalone server has its own traced runtime and static assets. Keeping
// the original build output as well would ship large Webpack caches twice.
for (const entry of readdirSync(join(web, ".next"))) {
  if (entry !== "standalone") {
    rmSync(join(web, ".next", entry), { recursive: true, force: true });
  }
}
