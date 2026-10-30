"use server";

import {
  addMemberInputSchema,
  createProjectRoleInputSchema,
  deleteProjectRoleInputSchema,
  removeMemberInputSchema,
  setMemberAccessInputSchema,
  updateProjectRoleInputSchema,
  type AddMemberInput,
  type CreateProjectRoleInput,
  type DeleteProjectRoleInput,
  type RemoveMemberInput,
  type SetMemberAccessInput,
  type UpdateProjectRoleInput,
} from "@mnemo/contracts/project-access";
import { revalidatePath } from "next/cache";

import { resolveActor } from "@/server/auth/resolve-actor";

import { getProjectAccessService } from "./project-access-service-factory";

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

export async function addProjectMember(input: AddMemberInput) {
  const parsed = addMemberInputSchema.parse(input);
  await getProjectAccessService().addMember((await resolveActor()).id, parsed);
  refreshAccess(parsed.projectId);
}
