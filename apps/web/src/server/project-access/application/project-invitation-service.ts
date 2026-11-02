import { createHash, randomBytes } from "node:crypto";

import type { IssueProjectInvitationInput } from "@mnemo/contracts/project-access";

import { sendTransactionalEmail } from "@/server/email/brevo-email";

import type { ProjectInvitationRepository } from "./project-invitation-repository";

const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1000;
const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

function hashToken(token: string) {
  if (!tokenPattern.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

export class ProjectInvitationService {
  constructor(private readonly invitations: ProjectInvitationRepository) {}

  async issue(actorId: string, input: IssueProjectInvitationInput) {
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + invitationLifetimeMs);
    const { projectTitle } = await this.invitations.issue(
      actorId,
      input,
      tokenHash,
      expiresAt,
    );

    try {
      await sendTransactionalEmail({
        to: input.email.trim().toLowerCase(),
        subject: `Invitation à rejoindre le dossier ${projectTitle} sur Mnemo`,
        intro: `Vous avez été invité à accéder au dossier « ${projectTitle} » sur Mnemo. Connectez-vous ou créez votre compte pour accepter cette invitation.`,
        actionLabel: "Accepter l'invitation",
        actionUrl: `/invitations/${token}`,
        note: "Ce lien est personnel, utilisable une seule fois et valable 7 jours. Si vous n'attendiez pas cette invitation, ignorez ce message.",
      });
    } catch {
      await this.invitations.removeUndelivered(tokenHash);
      throw new Error("Invitation email delivery failed");
    }
  }

  preview(token: string) {
    const tokenHash = hashToken(token);
    return tokenHash ? this.invitations.preview(tokenHash) : null;
  }

  listForAccount(actorId: string) {
    return this.invitations.listForAccount(actorId);
  }

  accept(actorId: string, token: string) {
    const tokenHash = hashToken(token);
    if (!tokenHash) throw new Error("Invalid invitation token");
    return this.invitations.accept(actorId, tokenHash);
  }

  acceptForAccount(actorId: string, invitationId: string) {
    return this.invitations.acceptForAccount(actorId, invitationId);
  }

  declineForAccount(actorId: string, invitationId: string) {
    return this.invitations.declineForAccount(actorId, invitationId);
  }

  revoke(actorId: string, projectId: string, invitationId: string) {
    return this.invitations.revoke(actorId, projectId, invitationId);
  }
}
