import type { IssueProjectInvitationInput } from "@mnemo/contracts/project-access";

export type InvitationPreview = {
  email: string;
  projectTitle: string;
  expiresAt: Date;
};

export type AccountProjectInvitation = {
  id: string;
  projectTitle: string;
  invitedBy: string;
  baseRole: "viewer" | "editor";
  expiresAt: Date;
};

export interface ProjectInvitationRepository {
  issue(
    actorId: string,
    input: IssueProjectInvitationInput,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<{ projectTitle: string }>;
  preview(tokenHash: string): Promise<InvitationPreview | null>;
  listForAccount(actorId: string): Promise<AccountProjectInvitation[]>;
  accept(actorId: string, tokenHash: string): Promise<string>;
  acceptForAccount(actorId: string, invitationId: string): Promise<string>;
  declineForAccount(actorId: string, invitationId: string): Promise<void>;
  revoke(
    actorId: string,
    projectId: string,
    invitationId: string,
  ): Promise<void>;
  removeUndelivered(tokenHash: string): Promise<void>;
}
