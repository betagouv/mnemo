import type { AccountQuery, UserRole } from "@mnemo/contracts/accounts";
import type { Account, AccountRepository } from "./account-repository";

export class AccountAdministrationError extends Error {}

export function requireAdministrator(account: Account | null) {
  if (
    !account?.emailVerified ||
    !account.approvedAt ||
    !account.roles.includes("admin")
  )
    throw new AccountAdministrationError(
      "L'accès est réservé aux administrateurs.",
    );
}

type AccountMail = {
  to: string;
  subject: string;
  intro: string;
  actionLabel: string;
  actionUrl: string;
  note: string;
};
export class AccountAdministration {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly send: (message: AccountMail) => Promise<void>,
    private readonly baseUrl: string,
  ) {}

  async list(actorId: string, query: AccountQuery) {
    requireAdministrator(await this.accounts.find(actorId));
    return this.accounts.list(query);
  }

  async approve(actorId: string, userId: string) {
    // The repository rechecks privileges under the same lock as the mutation.
    requireAdministrator(await this.accounts.find(actorId));
    const account = await this.accounts.approve(actorId, userId);
    if (account) {
      console.info("Account approved", {
        actorId,
        userId,
        at: new Date().toISOString(),
      });
      await this.deliver({
        to: account.email,
        subject: "Votre compte Mnemo a été approuvé",
        intro:
          "Un administrateur a approuvé votre compte. Après confirmation de votre adresse e-mail, vous pouvez accéder à vos dossiers Mnemo.",
        actionLabel: "Accéder à Mnemo",
        actionUrl: new URL("/connexion", this.baseUrl).href,
        note: "Les accès à chaque dossier sont définis par les membres qui le partagent avec vous.",
      });
    }
  }

  async updateRoles(actorId: string, userId: string, roles: UserRole[]) {
    requireAdministrator(await this.accounts.find(actorId));
    await this.accounts.updateRoles(actorId, userId, roles);
    console.info("Account roles changed", {
      actorId,
      userId,
      roles,
      at: new Date().toISOString(),
    });
  }

  async notifyRegistration(account: Pick<Account, "email" | "displayName">) {
    const admins = await this.accounts.administrators();
    await Promise.all(
      admins.map((admin) =>
        this.deliver({
          to: admin.email,
          subject: "Nouvelle demande de compte Mnemo",
          intro: `${account.displayName} (${account.email}) a demandé la création d'un compte Mnemo. Vérifiez cette demande dans l'administration.`,
          actionLabel: "Examiner les demandes",
          actionUrl: new URL("/admin/utilisateurs", this.baseUrl).href,
          note: "La confirmation de l'adresse e-mail et l'approbation d'un administrateur sont nécessaires pour accéder aux dossiers.",
        }),
      ),
    );
  }

  private async deliver(message: AccountMail) {
    try {
      await this.send(message);
    } catch {
      console.error("Account notification email delivery failed");
    }
  }
}
