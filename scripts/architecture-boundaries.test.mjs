import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkArchitecture } from "./architecture-boundaries.mjs";

async function check(files) {
  const root = await mkdtemp(join(tmpdir(), "mnemo-architecture-"));
  try {
    for (const [file, source] of Object.entries(files)) {
      const path = join(root, file);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, source);
    }
    return await checkArchitecture(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test("allows downward imports through public indexes", async () =>
  assert.deepEqual(
    await check({
      "widgets/viewer/ui/view.tsx": 'import { Plan } from "@/features/plans";',
      "features/plans/index.ts": 'export { Plan } from "./ui/plan";',
      "features/plans/ui/plan.tsx": "export const Plan = 1;",
    }),
    [],
  ));
test("rejects relative deep imports into another slice", async () =>
  assert.equal(
    (
      await check({
        "widgets/viewer/view.tsx":
          'import { Plan } from "../../features/plans/ui/plan";',
        "features/plans/ui/plan.tsx": "export const Plan = 1;",
      })
    ).length,
    1,
  ));
test("rejects sibling imports even through public APIs", async () =>
  assert.equal(
    (
      await check({
        "features/one/index.ts": 'export { two } from "../two";',
        "features/two/index.ts": "export const two=2;",
      })
    ).length,
    1,
  ));
test("rejects upward dynamic imports", async () =>
  assert.equal(
    (
      await check({
        "entities/project/index.ts":
          'export const load=()=>import("../../widgets/viewer");',
        "widgets/viewer/index.ts": "export const Viewer=1;",
      })
    ).length,
    1,
  ));
test("follows client imports and forbids private server DTOs", async () =>
  assert.equal(
    (
      await check({
        "features/plan/ui/view.tsx":
          '"use client"; import { action } from "../model/action";',
        "features/plan/model/action.ts":
          'import type { PrivateDto } from "@/server/plans/application/repository"; export const action=1;',
        "server/plans/application/repository.ts":
          "export type PrivateDto=string;",
      })
    ).length,
    1,
  ));
test("allows Server Actions and stops traversal at their boundary", async () =>
  assert.deepEqual(
    await check({
      "features/plan/index.tsx":
        '"use client"; import { save } from "@/server/plans/actions";',
      "server/plans/actions.ts":
        '"use server"; import { service } from "./application/service"; export async function save() {return service();}',
      "server/plans/application/service.ts": "export const service=()=>1;",
    }),
    [],
  ));
test("permits server composition in screens", async () =>
  assert.deepEqual(
    await check({
      "screens/project/index.ts":
        'import { read } from "@/server/project/application/service";',
      "server/project/application/service.ts": "export const read=()=>1;",
    }),
    [],
  ));
test("rejects infrastructure imports from application services", async () =>
  assert.equal(
    (
      await check({
        "server/project/application/service.ts":
          'import { db } from "../infrastructure/db";',
        "server/project/infrastructure/db.ts": "export const db=1;",
      })
    ).length,
    1,
  ));
test("rejects frontend dependencies in server modules", async () =>
  assert.equal(
    (
      await check({
        "server/project/application/service.ts":
          'import type { State } from "@/features/plans";',
        "features/plans/index.ts": "export type State=string;",
      })
    ).length,
    1,
  ));
test("rejects server-only modules and runtime packages in client graphs", async () =>
  assert.equal(
    (
      await check({
        "features/plan/index.tsx":
          '"use client"; import "server-only"; import { db } from "@mnemo/database";',
      })
    ).length,
    2,
  ));
