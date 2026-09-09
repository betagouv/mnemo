import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { createDatabase } from "./client";
import { requireDatabaseUrl } from "./runtime-database-url";

const database = createDatabase({
  connectionString: requireDatabaseUrl(),
  maxConnections: 1,
});

try {
  await migrate(database.db, {
    migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)),
  });
  console.log("Database migrations applied.");
} finally {
  await database.close();
}
