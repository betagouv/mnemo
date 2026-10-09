import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("selected profile overrides exported shell variables", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/with-env-profile.mjs",
      ".env.local.example",
      process.execPath,
      "-p",
      "process.env.S3_ENDPOINT",
    ],
    {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, S3_ENDPOINT: "https://s3.example.org" },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "http://localhost:9200");
});
