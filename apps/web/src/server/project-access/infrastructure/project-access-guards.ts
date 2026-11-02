import { Prisma } from "@mnemo/database";

import { ProjectAccessDeniedError } from "../application/project-access-service";

export async function requireOwner(
  tx: Prisma.TransactionClient,
  projectId: string,
  actorId: string,
) {
  const member = await tx.project_members.findUnique({
    where: { project_id_user_id: { project_id: projectId, user_id: actorId } },
    select: { role: true },
  });
  if (member?.role !== "owner") throw new ProjectAccessDeniedError();
}

export async function requireProjectRoles(
  tx: Prisma.TransactionClient,
  projectId: string,
  roleIds: string[],
) {
  const uniqueIds = [...new Set(roleIds)];
  if (!uniqueIds.length) return;
  const count = await tx.project_roles.count({
    where: { project_id: projectId, id: { in: uniqueIds } },
  });
  if (count !== uniqueIds.length) throw new ProjectAccessDeniedError();
}
