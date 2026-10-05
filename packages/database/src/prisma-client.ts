import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client";

export type PrismaDatabaseOptions = {
  connectionString: string;
  maxConnections?: number;
};

export function createPrismaDatabase({
  connectionString,
  maxConnections = 10,
}: PrismaDatabaseOptions) {
  const adapter = new PrismaPg({ connectionString, max: maxConnections });
  const db = new PrismaClient({ adapter });

  return {
    db,
    close: () => db.$disconnect(),
  };
}

export type MnemoPrismaDatabase = ReturnType<typeof createPrismaDatabase>["db"];
