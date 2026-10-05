import "server-only";

import {
  createPrismaDatabase,
  type MnemoPrismaDatabase,
} from "@mnemo/database";

const globalDatabase = globalThis as typeof globalThis & {
  mnemoPrismaDatabase?: MnemoPrismaDatabase;
};

export function getRuntimePrismaDatabase(): MnemoPrismaDatabase {
  if (globalDatabase.mnemoPrismaDatabase)
    return globalDatabase.mnemoPrismaDatabase;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to access project data");
  }

  const { db } = createPrismaDatabase({ connectionString });
  globalDatabase.mnemoPrismaDatabase = db;
  return db;
}
