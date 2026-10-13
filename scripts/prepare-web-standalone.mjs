import { cpSync, existsSync } from "node:fs";
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
