import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";

export type DatabaseOptions = {
  connectionString: string;
  maxConnections?: number;
};

export function createDatabase({
  connectionString,
  maxConnections = 10,
}: DatabaseOptions) {
  const pool = new Pool({
    connectionString,
    max: maxConnections,
  });
  const db = drizzle({ client: pool, schema });

  return {
    db,
    close: () => pool.end(),
  };
}

export type MnemoDatabase = ReturnType<typeof createDatabase>["db"];
