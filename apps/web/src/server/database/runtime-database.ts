import "server-only";

import { createDatabase, type MnemoDatabase } from "@mnemo/database";

const globalDatabase = globalThis as typeof globalThis & {
  mnemoDatabase?: MnemoDatabase;
};

export function getRuntimeDatabase(): MnemoDatabase {
  if (globalDatabase.mnemoDatabase) {
    return globalDatabase.mnemoDatabase;
  }

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is required to access project data");
  }

  const { db } = createDatabase({ connectionString });
  globalDatabase.mnemoDatabase = db;

  return db;
}
