import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import { addCustomDomain } from "@/server/domains";
import { resolveSite } from "@/server/publicEvents";

// adresse d'une billetterie (RG-SDM-03, US-BRD-05) : domaine personnalisé, sous-domaine d'un événement, ancienne adresse redirigée
const rid = () => Math.random().toString(36).slice(2, 10);
async function setup(o: { pro?: boolean } = {}) {
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
  if (o.pro !== false)
    await db.subscription.create({
      data: {
        organizationId: org.id,
        planId: "pro",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000),
      },
    });
  const ctx = {
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: owner.name ?? "", email: owner.email },
  };
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Gala ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 30 * 86_400_000),
      status: "PUBLISHED",
    },
  });
  return { ctx, org, event, id };
}

describe("adresse d'une billetterie : domaine personnalisé", () => {
  it("inconnu : désactivé ; en attente : désactivé avec repli ; actif : l'organisation ; dédié à un événement : l'événement", async () => {
    const { ctx, org, event, id } = await setup();
    expect(await resolveSite(`_d_inconnu-${id}.club.be`)).toEqual({
      kind: "DISABLED",
      fallback: null,
    });
    const pending = await addCustomDomain(
      ctx,
      `billetterie-${id}.club.be`,
      "ORGANIZATION",
    );
    expect(await resolveSite(`_d_${pending.domain}`)).toMatchObject({
      kind: "DISABLED",
      fallback: expect.stringContaining(org.subdomain!),
    });
    await db.customDomain.update({
      where: { id: pending.id },
      data: { status: "ACTIVE" },
    });
    expect(await resolveSite(`_d_${pending.domain}`)).toMatchObject({
      kind: "ORG",
      org: expect.objectContaining({ id: org.id }),
    });
    const dedicated = await addCustomDomain(
      ctx,
      `gala-${id}.club.be`,
      "EVENT",
      event.id,
    );
    await db.customDomain.update({
      where: { id: dedicated.id },
      data: { status: "ACTIVE" },
    });
    expect(await resolveSite(`_d_${dedicated.domain}`)).toMatchObject({
      kind: "EVENT",
      eventId: event.id,
    });
  });
});

describe("adresse d'une billetterie : sous-domaine d'un événement et ancienne adresse", () => {
  it("sous-domaine d'un événement : en Pro, l'événement ; après un retour en Free, redirection vers l'organisation", async () => {
    const pro = await setup();
    await db.event.update({
      where: { id: pro.event.id },
      data: { subdomain: `soiree-${pro.id}` },
    });
    expect(await resolveSite(`soiree-${pro.id}`)).toMatchObject({
      kind: "EVENT",
      eventId: pro.event.id,
    });
    const free = await setup({ pro: false });
    await db.event.update({
      where: { id: free.event.id },
      data: { subdomain: `fete-${free.id}` },
    });
    expect(await resolveSite(`fete-${free.id}`)).toMatchObject({
      kind: "REDIRECT",
      rootPath: `/${free.event.slug}`,
    });
  });

  it("ancienne adresse : redirigée tant qu'elle n'a pas expiré ; adresse inconnue : rien", async () => {
    const { org, id } = await setup();
    const host = (sub: string) => `${sub}.${env().NEXT_PUBLIC_BASE_DOMAIN}`;
    await db.hostRedirect.create({
      data: {
        host: host(`ancien-${id}`),
        organizationId: org.id,
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    await db.hostRedirect.create({
      data: {
        host: host(`perime-${id}`),
        organizationId: org.id,
        expiresAt: new Date(Date.now() - 86_400_000),
      },
    });
    expect(await resolveSite(`ancien-${id}`)).toMatchObject({
      kind: "REDIRECT",
      rootPath: "",
    });
    expect(await resolveSite(`perime-${id}`)).toBeNull();
    expect(await resolveSite(`inconnu-${id}`)).toBeNull();
  });
});
