"use server";

import {
  issueProjectInvitationInputSchema,
  createProjectRoleInputSchema,
  deleteProjectRoleInputSchema,
  removeMemberInputSchema,
  revokeProjectInvitationInputSchema,
  setMemberAccessInputSchema,
  updateProjectRoleInputSchema,
  type IssueProjectInvitationInput,
  type CreateProjectRoleInput,
  type DeleteProjectRoleInput,
  type RemoveMemberInput,
  type RevokeProjectInvitationInput,
  type SetMemberAccessInput,
  type UpdateProjectRoleInput,
} from "@mnemo/contracts/project-access";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { resolveActor } from "@/server/auth/resolve-actor";

import { getProjectAccessService } from "./project-access-service-factory";
import { getProjectInvitationService } from "./project-invitation-service-factory";

function refreshAccess(projectId: string) {
  revalidatePath(`/projets/${projectId}/acces`);
  revalidatePath(`/projets/${projectId}`);
  revalidatePath(`/projets/${projectId}/viewer`);
}

export async function createProjectRole(input: CreateProjectRoleInput) {
  const parsed = createProjectRoleInputSchema.parse(input);
  await getProjectAccessService().createRole((await resolveActor()).id, parsed);
  refreshAccess(parsed.projectId);
}

export async function updateProjectRole(input: UpdateProjectRoleInput) {
  const parsed = updateProjectRoleInputSchema.parse(input);
  await getProjectAccessService().updateRole((await resolveActor()).id, parsed);
  refreshAccess(parsed.projectId);
}

export async function deleteProjectRole(input: DeleteProjectRoleInput) {
  const parsed = deleteProjectRoleInputSchema.parse(input);
  await getProjectAccessService().deleteRole(
    (await resolveActor()).id,
    parsed.projectId,
    parsed.roleId,
  );
  refreshAccess(parsed.projectId);
}

export async function setMemberAccess(input: SetMemberAccessInput) {
  const parsed = setMemberAccessInputSchema.parse(input);
  await getProjectAccessService().setMember((await resolveActor()).id, parsed);
  refreshAccess(parsed.projectId);
}

export async function removeProjectMember(input: RemoveMemberInput) {
  const parsed = removeMemberInputSchema.parse(input);
  await getProjectAccessService().removeMember(
    (await resolveActor()).id,
    parsed.projectId,
    parsed.userId,
  );
  refreshAccess(parsed.projectId);
}

export async function issueProjectInvitation(
  input: IssueProjectInvitationInput,
) {
  const parsed = issueProjectInvitationInputSchema.parse(input);
  await getProjectInvitationService().issue((await resolveActor()).id, parsed);
  refreshAccess(parsed.projectId);
}

export async function revokeProjectInvitation(
  input: RevokeProjectInvitationInput,
) {
  const parsed = revokeProjectInvitationInputSchema.parse(input);
  await getProjectInvitationService().revoke(
    (await resolveActor()).id,
    parsed.projectId,
    parsed.invitationId,
  );
  refreshAccess(parsed.projectId);
}

export async function acceptProjectInvitation(token: string) {
  const projectId = await getProjectInvitationService().accept(
    (await resolveActor()).id,
    token,
  );
  refreshAccess(projectId);
  revalidatePath("/projets");
  return projectId;
}

export async function acceptAccountProjectInvitation(invitationId: string) {
  const id = z.uuid().parse(invitationId);
  const projectId = await getProjectInvitationService().acceptForAccount(
    (await resolveActor()).id,
    id,
  );
  refreshAccess(projectId);
  revalidatePath("/projets");
  revalidatePath("/compte");
  return projectId;
}

export async function declineAccountProjectInvitation(invitationId: string) {
  const id = z.uuid().parse(invitationId);
  await getProjectInvitationService().declineForAccount(
    (await resolveActor()).id,
    id,
  );
  revalidatePath("/compte");
}
