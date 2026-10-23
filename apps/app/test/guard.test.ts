import { CoreError } from "@evoly/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// session et cookie de double authentification simulés : la garde est testée telle quelle, sans navigateur
const state: { session: unknown } = { session: null };
vi.mock("@/server/session", () => ({ getSession: async () => state.session }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));

const { db } = await import("@/lib/db");
const { formToObject, runOrgAction, zodFields } =
  await import("@/server/guard");

const rid = () => Math.random().toString(36).slice(2, 10);
const schema = z.object({ name: z.string().min(2, "trop court") });

async function setup(plan: "free" | "pro" = "free") {
  const id = rid();
  const org = await db.organization.create({
    data: {
      name: `Club ${id}`,
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
      timezone: "Europe/Brussels",
      locale: "fr",
    },
  });
  if (plan === "pro")
    await db.subscription.create({
      data: { organizationId: org.id, planId: "pro", status: "ACTIVE" },
    });
  const member = async (
    systemKey: "OWNER" | "SCANNER" | "VIEWER",
    extra: { twoFactorEnabled?: boolean; emailVerified?: boolean } = {},
  ) => {
    const user = await db.user.create({
      data: {
        name: "Camille",
        email: `u.${rid()}@exemple.be`,
        emailVerified: extra.emailVerified ?? true,
        twoFactorEnabled: extra.twoFactorEnabled ?? false,
      },
    });
    const role = await db.role.findFirstOrThrow({ where: { systemKey } });
    await db.organizationMember.create({
      data: {
        organizationId: org.id,
        userId: user.id,
        roleId: role.id,
        status: "ACTIVE",
      },
    });
    return user;
  };
  return { org, member };
}
const login = (u: {
  id: string;
  name: string | null;
  email: string;
  emailVerified: boolean;
}) => {
  state.session = {
    user: {
      id: u.id,
      name: u.name ?? "",
      email: u.email,
      emailVerified: u.emailVerified,
    },
    session: { id: `s-${rid()}` },
  };
};

describe("garde des actions d'organisation (RG-ARC-03)", () => {
  beforeEach(() => {
    state.session = null;
  });

  it("refus dans l'ordre : saisie, connexion, e-mail vérifié, double authentification, organisation, équipe réservée à Pro, permission, offre, lecture seule", async () => {
    const s = await setup("free");
    const ok = async () => "fait";
    expect(
      await runOrgAction(s.org.slug, { name: "a" }, { schema }, ok),
    ).toEqual({
      ok: false,
      error: "INVALID_INPUT",
      fields: { name: "trop court" },
    });
    expect(
      await runOrgAction(s.org.slug, { name: "Gala" }, { schema }, ok),
    ).toEqual({ ok: false, error: "UNAUTHENTICATED" });
    login(await s.member("OWNER", { emailVerified: false }));
    expect(
      await runOrgAction(s.org.slug, { name: "Gala" }, { schema }, ok),
    ).toEqual({ ok: false, error: "UNAUTHENTICATED" });
    login(await s.member("OWNER", { twoFactorEnabled: true }));
    expect(
      await runOrgAction(s.org.slug, { name: "Gala" }, { schema }, ok),
    ).toEqual({ ok: false, error: "TWO_FACTOR_REQUIRED" });
    const owner = await s.member("OWNER");
    login(owner);
    expect(
      await runOrgAction(`inconnue-${rid()}`, { name: "Gala" }, { schema }, ok),
    ).toEqual({ ok: false, error: "NOT_FOUND" });
    expect(
      await runOrgAction(
        s.org.slug,
        { name: "Gala" },
        { schema, feature: "AMBASSADORS" },
        ok,
      ),
    ).toEqual({ ok: false, error: "PRO_REQUIRED" });
    expect(
      await runOrgAction(
        s.org.slug,
        { name: "Gala" },
        { schema, permission: "TICKETS_MANAGE" },
        ok,
      ),
    ).toEqual({ ok: true, data: "fait" });
    // l'équipe est une fonction Pro : en Free, un membre qui n'est pas propriétaire n'accède pas à l'organisation
    login(await s.member("VIEWER"));
    expect(
      await runOrgAction(s.org.slug, { name: "Gala" }, { schema }, ok),
    ).toEqual({ ok: false, error: "NOT_FOUND" });
    // en Pro, il y accède, mais sans la permission demandée
    const pro = await setup("pro");
    login(await pro.member("VIEWER"));
    expect(
      await runOrgAction(
        pro.org.slug,
        { name: "Gala" },
        { schema, permission: "TICKETS_MANAGE" },
        ok,
      ),
    ).toEqual({ ok: false, error: "FORBIDDEN" });
    // organisation suspendue : lecture seule, sauf pour une simple lecture
    login(owner);
    await db.organization.update({
      where: { id: s.org.id },
      data: { status: "SUSPENDED" },
    });
    expect(
      await runOrgAction(s.org.slug, { name: "Gala" }, { schema }, ok),
    ).toEqual({ ok: false, error: "READ_ONLY" });
    expect(
      await runOrgAction(
        s.org.slug,
        { name: "Gala" },
        { schema, write: false },
        ok,
      ),
    ).toEqual({ ok: true, data: "fait" });
  });

  it("erreur métier renvoyée proprement ; erreur inattendue jamais masquée ; données reçues validées", async () => {
    const s = await setup("pro");
    login(await s.member("OWNER"));
    expect(
      await runOrgAction(s.org.slug, { name: "Gala" }, { schema }, async () => {
        throw new CoreError("PROMO_USED");
      }),
    ).toEqual({ ok: false, error: "PROMO_USED" });
    await expect(
      runOrgAction(s.org.slug, { name: "Gala" }, { schema }, async () => {
        throw new Error("panne");
      }),
    ).rejects.toThrow("panne");
    expect(
      await runOrgAction(
        s.org.slug,
        { name: "Gala" },
        { schema, feature: "AMBASSADORS" },
        async (d, ctx) => `${d.name} · ${ctx.organization.slug}`,
      ),
    ).toEqual({ ok: true, data: `Gala · ${s.org.slug}` });
  });

  it("formulaires : seuls les champs texte sont gardés ; un message par champ, le premier", () => {
    const form = new FormData();
    form.set("name", "Gala");
    form.set("affiche", new Blob(["x"]), "affiche.png");
    expect(formToObject(form)).toEqual({ name: "Gala" });
    const r = z
      .object({
        name: z.string().min(2, "trop court").max(3, "trop long"),
        age: z.number({ message: "nombre attendu" }),
      })
      .safeParse({ name: "a", age: "x" });
    expect(zodFields(r.error!)).toEqual({
      name: "trop court",
      age: "nombre attendu",
    });
  });
});
