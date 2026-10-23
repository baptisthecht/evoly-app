import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import {
  addCustomDomain,
  listCustomDomains,
  removeCustomDomain,
  verifyPendingDomains,
} from "@/server/domains";

const rid = () => Math.random().toString(36).slice(2, 10);
async function setup(plan: "free" | "pro") {
  const id = rid();
  const owner = await db.user.create({
    data: {
      name: "Camille Dupont",
      email: `own.${id}@exemple.be`,
      emailVerified: true,
    },
  });
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
  const ownerRole = await db.role.findFirstOrThrow({
    where: { systemKey: "OWNER" },
  });
  await db.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: owner.id,
      roleId: ownerRole.id,
      status: "ACTIVE",
    },
  });
  if (plan === "pro")
    await db.subscription.create({
      data: { organizationId: org.id, planId: "pro", status: "ACTIVE" },
    });
  return {
    id,
    org,
    ctx: {
      ...(await findOrgContext(owner.id, org.slug))!,
      user: { id: owner.id, name: owner.name ?? "", email: owner.email },
    },
  };
}

describe("domaines personnalisés (section 9.19)", () => {
  it("refus : offre gratuite, domaine invalide, domaine d'Evoly, domaine déjà pris", async () => {
    const free = await setup("free");
    await expect(
      addCustomDomain(free.ctx, "billets.monclub.be", "ORGANIZATION"),
    ).rejects.toMatchObject({ code: "PRO_REQUIRED" });
    const s = await setup("pro");
    await expect(
      addCustomDomain(s.ctx, "pas un domaine", "ORGANIZATION"),
    ).rejects.toMatchObject({ code: "DOMAIN_INVALID" });
    await expect(
      addCustomDomain(s.ctx, `club-${s.id}.evoly.me`, "ORGANIZATION"),
    ).rejects.toMatchObject({ code: "DOMAIN_RESERVED" });
    await addCustomDomain(s.ctx, `billets-${s.id}.monclub.be`, "ORGANIZATION");
    const autre = await setup("pro");
    await expect(
      addCustomDomain(autre.ctx, `billets-${s.id}.monclub.be`, "ORGANIZATION"),
    ).rejects.toMatchObject({ code: "DOMAIN_TAKEN" });
  });

  it("mauvaise cible DNS : en attente, erreur notée ; bonne cible : actif ; retrait", async () => {
    const s = await setup("pro");
    const d = await addCustomDomain(
      s.ctx,
      `BILLETS-${s.id}.MonClub.be`,
      "ORGANIZATION",
    );
    expect(d).toMatchObject({
      domain: `billets-${s.id}.monclub.be`,
      status: "PENDING_DNS",
    });
    expect((await listCustomDomains(s.ctx)).map((x) => x.id)).toContain(d.id);
    let records: string[] = ["autre-cible.exemple.be."];
    const resolver = {
      resolveCname: async (host: string) => (host === d.domain ? records : []),
    } as never;
    await verifyPendingDomains(resolver);
    const attente = await db.customDomain.findUniqueOrThrow({
      where: { id: d.id },
    });
    expect(attente.status).toBe("PENDING_DNS");
    expect(attente.lastError).toContain("WRONG_TARGET");
    records = [`${d.dnsTarget.toUpperCase()}.`]; // casse et point final ignorés
    await verifyPendingDomains(resolver);
    expect(
      await db.customDomain.findUniqueOrThrow({ where: { id: d.id } }),
    ).toMatchObject({ status: "ACTIVE", lastError: null });
    await removeCustomDomain(s.ctx, d.id);
    expect(
      await db.customDomain.findUnique({ where: { id: d.id } }),
    ).toBeNull();
    await expect(removeCustomDomain(s.ctx, d.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
