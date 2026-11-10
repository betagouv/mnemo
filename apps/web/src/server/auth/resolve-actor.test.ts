import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), account: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("./better-auth", () => ({
  auth: { api: { getSession: mocks.session } },
}));
vi.mock("@/server/database/runtime-database", () => ({
  getRuntimePrismaDatabase: () => ({ users: { findUnique: mocks.account } }),
}));
import {
  AuthenticationRequiredError,
  getCurrentActor,
  getCurrentAccount,
  resolveActor,
  resolvePageActor,
} from "./resolve-actor";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue({
    user: { id: "user", emailVerified: true },
  });
  mocks.account.mockResolvedValue({
    id: "user",
    email_verified: true,
    roles: ["user"],
    approved_at: null,
  });
});
it("keeps a pending verified session while denying workspace and API access", async () => {
  expect(await getCurrentAccount()).toMatchObject({ id: "user" });
  expect(await getCurrentActor()).toBeNull();
  await expect(resolveActor()).rejects.toBeInstanceOf(
    AuthenticationRequiredError,
  );
  await expect(resolvePageActor()).rejects.toThrow(
    "redirect:/compte-en-attente",
  );
});
it("reads approval and roles live with an already existing session", async () => {
  expect(await getCurrentActor()).toBeNull();
  mocks.account.mockResolvedValue({
    id: "user",
    email_verified: true,
    roles: ["user", "admin"],
    approved_at: new Date(),
  });
  expect(await getCurrentActor()).toEqual({ id: "user" });
  expect(await getCurrentAccount()).toMatchObject({ roles: ["user", "admin"] });
  mocks.account.mockResolvedValue({
    id: "user",
    email_verified: true,
    roles: ["user"],
    approved_at: new Date(),
  });
  expect(await getCurrentAccount()).toMatchObject({ roles: ["user"] });
});
it("denies unverified or deleted accounts even with a session", async () => {
  mocks.session.mockResolvedValue({
    user: { id: "user", emailVerified: false },
  });
  expect(await getCurrentActor()).toBeNull();
  expect(mocks.account).not.toHaveBeenCalled();
  mocks.session.mockResolvedValue({
    user: { id: "user", emailVerified: true },
  });
  mocks.account.mockResolvedValue(null);
  expect(await getCurrentActor()).toBeNull();
  mocks.account.mockResolvedValue({
    id: "user",
    email_verified: false,
    approved_at: new Date(),
  });
  expect(await getCurrentActor()).toBeNull();
});
