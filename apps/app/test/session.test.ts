import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as null | {
    user: { id: string; email: string; emailVerified: boolean };
    session: { id: string };
  },
  user: null as null | { id: string; twoFactorEnabled: boolean },
  satisfied: true,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT ${url}`);
  },
}));
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: async () => state.session } },
}));
vi.mock("@/lib/db", () => ({
  db: { user: { findUnique: async () => state.user } },
}));
vi.mock("@/server/twoFactor", () => ({
  twoFactorSatisfied: async () => state.satisfied,
}));
const { getSession, requireUser } = await import("@/server/session");

const signedIn = (verified = true) => ({
  user: { id: "u1", email: "lea+test@exemple.be", emailVerified: verified },
  session: { id: "s1" },
});
beforeEach(() => {
  state.session = null;
  state.user = { id: "u1", twoFactorEnabled: false };
  state.satisfied = true;
});

describe("accès aux pages : trois verrous (RG-AUTH-01, RG-AUTH-03, US-AUTH-06)", () => {
  it("sans session : vers la connexion", async () => {
    await expect(requireUser()).rejects.toThrow("REDIRECT /login");
  });

  it("adresse non vérifiée : vers la vérification, l'adresse transmise encodée", async () => {
    state.session = signedIn(false);
    await expect(requireUser()).rejects.toThrow(
      `REDIRECT /verify-email?email=${encodeURIComponent("lea+test@exemple.be")}`,
    );
  });

  it("double authentification activée et code pas encore saisi pour cette session : vers le code", async () => {
    state.session = signedIn();
    state.user = { id: "u1", twoFactorEnabled: true };
    state.satisfied = false;
    await expect(requireUser()).rejects.toThrow("REDIRECT /2fa");
  });

  it("code saisi, ou double authentification non activée : accès accordé", async () => {
    state.session = signedIn();
    state.user = { id: "u1", twoFactorEnabled: true };
    expect(await requireUser()).toBe(state.session);
    state.user = { id: "u1", twoFactorEnabled: false };
    expect(await requireUser()).toBe(state.session);
  });

  it("la session vient de la requête en cours", async () => {
    state.session = signedIn();
    expect(await getSession()).toBe(state.session);
  });
});
