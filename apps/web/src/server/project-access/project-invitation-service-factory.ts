import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";

import { ProjectInvitationService } from "./application/project-invitation-service";
import { PrismaProjectInvitationRepository } from "./infrastructure/prisma-project-invitation-repository";

export function getProjectInvitationService() {
  return new ProjectInvitationService(
    new PrismaProjectInvitationRepository(getRuntimePrismaDatabase()),
  );
}
