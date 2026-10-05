import { createPrismaDatabase } from "./prisma-client";
import { developmentActorId } from "./development-actor";
import { requireDatabaseUrl } from "./runtime-database-url";

const database = createPrismaDatabase({
  connectionString: requireDatabaseUrl(),
  maxConnections: 1,
});

try {
  await database.db.users.upsert({
    where: { id: developmentActorId },
    create: {
      id: developmentActorId,
      email: "dev@mnemo.local",
      display_name: "Utilisateur local",
    },
    update: {
      email: "dev@mnemo.local",
      display_name: "Utilisateur local",
      updated_at: new Date(),
    },
  });
  console.log("Development actor seeded.");
} finally {
  await database.close();
}
