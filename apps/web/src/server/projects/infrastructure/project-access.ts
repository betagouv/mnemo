import { Prisma } from "@mnemo/database";
import { isProjectPermission, type ProjectAccess } from "@mnemo/domain/project";

export const membershipAccessInclude = {
  permissions: true,
  custom_roles: {
    include: { role: { include: { permissions: true } } },
  },
} as const;

type MembershipWithAccess = Prisma.project_membersGetPayload<{
  include: typeof membershipAccessInclude;
}>;

export function toProjectAccess(
  membership: MembershipWithAccess,
): ProjectAccess {
  const grants = [
    ...membership.permissions.map((grant) => grant.permission),
    ...membership.custom_roles.flatMap((assignment) =>
      assignment.role.permissions.map((grant) => grant.permission),
    ),
  ];
  return {
    role: membership.role,
    permissions: [...new Set(grants.filter(isProjectPermission))],
  };
}
