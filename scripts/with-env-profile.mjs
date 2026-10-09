import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";

const [profilePath, command, ...args] = process.argv.slice(2);

if (!profilePath || !command) {
  console.error("Usage: with-env-profile.mjs <env-file> <command> [args...]");
  process.exit(2);
}

const profile = parseEnv(readFileSync(profilePath, "utf8"));
const result = spawnSync(command, args, {
  env: { ...process.env, ...profile },
  stdio: "inherit",
});

if (result.error) throw result.error;
if (result.signal) process.exit(130);
process.exit(result.status ?? 1);
