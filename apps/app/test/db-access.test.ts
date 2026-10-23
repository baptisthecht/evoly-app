import { describe, expect, it, vi } from "vitest";

// session et double authentification simulées : la vérification est testée telle que Caddy l'appelle
const state: { session: unknown; twofa: boolean } = {
  session: null,
  twofa: false,
};
vi.mock("@/server/session", () => ({ getSession: async () => state.session }));
vi.mock("@/server/twoFactor", async (original) => ({
  ...(await original<typeof import("@/server/twoFactor")>()),
  twoFactorSatisfied: async () => state.twofa,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  }),
  headers: async () => new Headers(),
}));

const { db } = await import("@/lib/db");
const { GET } = await import("@/app/api/admin/acces-base/route");

const rid = () => Math.random().toString(36).slice(2, 10);
const login = (userId: string) => {
  state.session = { user: { id: userId }, session: { id: `s-${rid()}` } };
};
const user = (
  data: { platformRole?: "ADMIN" | "SUPPORT"; twoFactorEnabled?: boolean } = {},
) =>
  db.user.create({
    data: {
      name: "Camille",
      email: `u.${rid()}@exemple.be`,
      emailVerified: true,
      ...data,
    },
  });

describe("accès complet à la base par pgAdmin, vérifié par Caddy (RG-ADM-01)", () => {
  it("non connecté : connexion puis retour ; non membre de l'équipe : introuvable ; double authentification exigée ; support refusé ; administrateur vérifié accepté", async () => {
    state.session = null;
    state.twofa = false;
    let r = await GET();
    expect(r.status).toBe(302);
    expect(r.headers.get("Location")).toBe("/login?next=%2Fpgadmin");
    login((await user()).id);
    expect((await GET()).status).toBe(404); // rien ne révèle pgAdmin
    login((await user({ platformRole: "ADMIN", twoFactorEnabled: true })).id);
    r = await GET();
    expect(r.status).toBe(302);
    expect(r.headers.get("Location")).toBe("/admin/2fa");
    state.twofa = true;
    login((await user({ platformRole: "SUPPORT", twoFactorEnabled: true })).id);
    expect((await GET()).status).toBe(403);
    login((await user({ platformRole: "ADMIN", twoFactorEnabled: true })).id);
    expect((await GET()).status).toBe(204);
  });
});
