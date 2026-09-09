import { createDatabase } from "./client";
import { developmentActorId } from "./development-actor";
import { requireDatabaseUrl } from "./runtime-database-url";
import { users } from "./schema";

const database = createDatabase({
  connectionString: requireDatabaseUrl(),
  maxConnections: 1,
});

try {
  await database.db
    .insert(users)
    .values({
      id: developmentActorId,
      email: "dev@mnemo.local",
      displayName: "Utilisateur local",
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email: "dev@mnemo.local",
        displayName: "Utilisateur local",
        updatedAt: new Date(),
      },
    });
  console.log("Development actor seeded.");
} finally {
  await database.close();
}
