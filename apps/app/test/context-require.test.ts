import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  user: null as null | { id: string; name: string; email: string },
}));
vi.mock("@/server/session", () => ({
  requireUser: async () => {
    if (!session.user) throw new Error("REDIRECT /connexion");
    return { user: session.user };
  },
  getSession: async () => (session.user ? { user: session.user } : null),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
const support = vi.hoisted(() => ({ allowed: false }));
vi.mock("@/server/platform", () => ({
  supportViewAllowed: async () => support.allowed,
}));

const { db } = await import("@/lib/db");
const { orgContextFromSession, requireOrgContext } =
  await import("@/server/context");

const rid = () => Math.random().toString(36).slice(2, 10);
async function proOrgWithOwner() {
  const id = rid();
  const owner = await db.user.create({
    data: {
      name: "Camille",
      email: `own.${id}@exemple.be`,
      emailVerified: true,
    },
  });
  const role = await db.role.findUniqueOrThrow({
    where: { systemKey: "OWNER" },
  });
  const org = await db.organization.create({
    data: {
      name: `Club ${id}`,
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
      subscription: {
        create: {
          planId: "pro",
          status: "ACTIVE",
          currency: "EUR",
          stripeSubscriptionId: `sub_${id}`,
        },
      },
      members: { create: { userId: owner.id, roleId: role.id } },
    },
  });
  return { org, owner: { id: owner.id, name: owner.name, email: owner.email } };
}

beforeEach(() => {
  session.user = null;
  support.allowed = false;
});

describe("contrôle d'accès des pages (requireOrgContext)", () => {
  it("membre : le contexte porte l'utilisateur de la session", async () => {
    const s = await proOrgWithOwner();
    session.user = s.owner;
    expect(await requireOrgContext(s.org.slug)).toMatchObject({
      user: s.owner,
      organization: { id: s.org.id },
      supportView: false,
    });
  });

  it("inconnu : introuvable, sans rien laisser voir", async () => {
    const s = await proOrgWithOwner();
    session.user = {
      id: "quelqu-un",
      name: "Intrus",
      email: "intrus@exemple.be",
    };
    await expect(requireOrgContext(s.org.slug)).rejects.toThrow("NOT_FOUND");
  });

  it("support d'Evoly autorisé : consultation en lecture seule", async () => {
    const s = await proOrgWithOwner();
    session.user = { id: "agent", name: "Support", email: "support@evoly.me" };
    support.allowed = true;
    expect(await requireOrgContext(s.org.slug)).toMatchObject({
      supportView: true,
      readOnly: true,
    });
  });

  it("sans session : renvoyé vers la connexion", async () => {
    const s = await proOrgWithOwner();
    await expect(requireOrgContext(s.org.slug)).rejects.toThrow(
      "REDIRECT /connexion",
    );
  });
});

describe("contrôle d'accès des téléchargements (orgContextFromSession)", () => {
  it("sans session ou non-membre : rien", async () => {
    const s = await proOrgWithOwner();
    expect(await orgContextFromSession(s.org.slug)).toBeNull();
    session.user = {
      id: "quelqu-un",
      name: "Intrus",
      email: "intrus@exemple.be",
    };
    expect(await orgContextFromSession(s.org.slug)).toBeNull();
  });

  it("membre : contexte complet", async () => {
    const s = await proOrgWithOwner();
    session.user = s.owner;
    expect(await orgContextFromSession(s.org.slug)).toMatchObject({
      user: s.owner,
      organization: { id: s.org.id },
    });
  });
});
