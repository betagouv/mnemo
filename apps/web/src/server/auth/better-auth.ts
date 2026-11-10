import "server-only";

import { prismaAdapter } from "better-auth/adapters/prisma";
import { betterAuth } from "better-auth";

import { getRuntimePrismaDatabase } from "@/server/database/runtime-database";
import { sendTransactionalEmail } from "@/server/email/brevo-email";

export const auth = betterAuth({
  appName: "Mnemo",
  database: prismaAdapter(getRuntimePrismaDatabase(), {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 512,
    requireEmailVerification: true,
    sendResetPassword: async ({ user, url }) => {
      try {
        await sendTransactionalEmail({
          to: user.email,
          subject: "Réinitialiser votre mot de passe Mnemo",
          intro:
            "Vous avez demandé à choisir un nouveau mot de passe pour votre compte Mnemo.",
          actionLabel: "Réinitialiser mon mot de passe",
          actionUrl: url,
          note: "Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer ce message.",
        });
        console.info("Password reset email accepted by Brevo");
      } catch (error) {
        console.error(
          "Password reset email delivery failed:",
          error instanceof Error ? error.message : "unknown",
        );
      }
    },
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      try {
        await sendTransactionalEmail({
          to: user.email,
          subject: "Confirmer votre adresse e-mail Mnemo",
          intro:
            "Confirmez votre adresse e-mail. Un administrateur devra ensuite approuver votre compte pour vous donner accès à Mnemo.",
          actionLabel: "Confirmer mon adresse",
          actionUrl: url,
          note: "Si vous n'avez pas créé de compte Mnemo, vous pouvez ignorer ce message.",
        });
        console.info("Verification email accepted by Brevo");
      } catch (error) {
        console.error(
          "Verification email delivery failed:",
          error instanceof Error ? error.message : "unknown",
        );
      }
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          const { getAccountAdministration } =
            await import("@/server/accounts/account-administration-factory");
          try {
            await getAccountAdministration().notifyRegistration({
              displayName: user.name,
              email: user.email,
            });
          } catch {
            console.error("Registration administrator notification failed");
          }
        },
      },
    },
  },
  user: {
    modelName: "users",
    fields: {
      name: "display_name",
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  session: {
    modelName: "auth_sessions",
    fields: {
      userId: "user_id",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    expiresIn: 60 * 60 * 12,
  },
  account: {
    modelName: "auth_accounts",
    fields: {
      userId: "user_id",
      accountId: "account_id",
      providerId: "provider_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      idToken: "id_token",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "auth_verifications",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "auth_rate_limits",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 5 },
      "/send-verification-email": { window: 60, max: 3 },
      "/request-password-reset": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
    },
  },
  advanced: {
    database: { generateId: "uuid" },
  },
});
