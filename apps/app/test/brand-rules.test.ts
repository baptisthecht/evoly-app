import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  changeOrganizationSubdomain,
  normalizeSocialLinks,
  saveEventTheme,
  setEventSubdomain,
  subdomainAvailable,
  themeFields,
} from "@/server/brand";
import { findOrgContext } from "@/server/context";

// marque (US-BRD) : réseaux sociaux, thème, style d'un événement, sous-domaines de l'organisation et d'un événement
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
  if (o.pro)
    await db.subscription.create({
      data: {
        organizationId: org.id,
        planId: "pro",
        status: "ACTIVE",
        currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000),
      },
    });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Gala ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 30 * 86_400_000),
      status: "DRAFT",
    },
  });
  const ctx = {
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: owner.name ?? "", email: owner.email },
  };
  return { ctx, org, event, id };
}
const refused = (code: string) => expect.objectContaining({ code });

describe("marque : réseaux sociaux", () => {
  it("adresse complétée en https, vide ignorée ; http, mauvais réseau ou adresse illisible refusés ; site web : tout domaine", () => {
    expect(
      normalizeSocialLinks({
        instagram: "  instagram.com/club.evoly ",
        facebook: "",
      }),
    ).toEqual({ instagram: "https://instagram.com/club.evoly" });
    expect(normalizeSocialLinks({})).toBeNull();
    expect(normalizeSocialLinks(null)).toBeNull();
    expect(normalizeSocialLinks({ website: "club-evoly.be" })).toEqual({
      website: "https://club-evoly.be/",
    });
    expect(() =>
      normalizeSocialLinks({ instagram: "http://instagram.com/club" }),
    ).toThrow(expect.objectContaining({ code: "BRAND_SOCIAL_INVALID" }));
    expect(() =>
      normalizeSocialLinks({ instagram: "https://facebook.com/club" }),
    ).toThrow(expect.objectContaining({ code: "BRAND_SOCIAL_INVALID" }));
    expect(() =>
      normalizeSocialLinks({ website: "https://exemple .be" }),
    ).toThrow(expect.objectContaining({ code: "BRAND_SOCIAL_INVALID" }));
  });
});

describe("marque : thème", () => {
  it("couleur, arrondi ou police inconnus refusés ; texte du bouton coupé à 40 caractères ; vide : rien d'imposé", () => {
    expect(() => themeFields({ backgroundColor: "rose" })).toThrow(
      expect.objectContaining({ code: "BRAND_COLOR_INVALID" }),
    );
    expect(() => themeFields({ radius: "pointu" })).toThrow(
      expect.objectContaining({ code: "BRAND_THEME_INVALID" }),
    );
    expect(() => themeFields({ headingFont: "Comic Sans" })).toThrow(
      expect.objectContaining({ code: "BRAND_THEME_INVALID" }),
    );
    expect(() => themeFields({ bodyFont: "Comic Sans" })).toThrow(
      expect.objectContaining({ code: "BRAND_THEME_INVALID" }),
    );
    expect(
      themeFields({ buttonLabel: `  ${"Je prends ma place ".repeat(4)}` })
        .buttonLabel,
    ).toHaveLength(40);
    expect(themeFields({})).toEqual({
      backgroundColor: null,
      radius: null,
      headingFont: null,
      bodyFont: null,
      buttonLabel: null,
    });
  });
});

describe("marque : style d'un événement (Pro)", () => {
  it("offre gratuite refusée ; événement d'un autre organisateur introuvable ; couleur invalide refusée ; « style de l'organisation » efface tout", async () => {
    const free = await setup();
    await expect(
      saveEventTheme(free.ctx, free.event.id, {
        useOrganization: false,
        primaryColor: "#111111",
      }),
    ).rejects.toEqual(refused("PRO_REQUIRED"));
    const { ctx, event } = await setup({ pro: true });
    const other = await setup({ pro: true });
    await expect(
      saveEventTheme(ctx, other.event.id, { useOrganization: false }),
    ).rejects.toEqual(refused("EVENT_NOT_FOUND"));
    await expect(
      saveEventTheme(ctx, event.id, {
        useOrganization: false,
        accentColor: "rouge",
      }),
    ).rejects.toEqual(refused("BRAND_COLOR_INVALID"));
    await saveEventTheme(ctx, event.id, {
      useOrganization: false,
      primaryColor: "#123456",
      buttonLabel: "Réserver",
    });
    expect(
      await db.event.findUniqueOrThrow({ where: { id: event.id } }),
    ).toMatchObject({
      primaryColor: expect.stringMatching(/^#123456$/i),
      buttonLabel: "Réserver",
    });
    await saveEventTheme(ctx, event.id, {
      useOrganization: true,
      primaryColor: "#654321",
    });
    expect(
      await db.event.findUniqueOrThrow({ where: { id: event.id } }),
    ).toMatchObject({ primaryColor: null, buttonLabel: null });
  });
});

describe("marque : sous-domaines", () => {
  it("adresse invalide ou déjà prise refusée ; sa propre adresse reste disponible pour elle", async () => {
    const a = await setup();
    const b = await setup();
    expect((await subdomainAvailable("a")).ok).toBe(false);
    expect(await subdomainAvailable(b.org.subdomain!)).toEqual({
      ok: false,
      reason: "TAKEN",
    });
    expect(
      await subdomainAvailable(a.org.subdomain!, { organizationId: a.org.id }),
    ).toMatchObject({ ok: true });
  });

  it("changement : l'ancienne adresse redirige, historique inscrit ; même adresse : rien ; adresse prise : refusée", async () => {
    const { ctx, org, id } = await setup();
    const other = await setup();
    await expect(
      changeOrganizationSubdomain(ctx, other.org.subdomain!),
    ).rejects.toEqual(refused("SUBDOMAIN_TAKEN"));
    await changeOrganizationSubdomain(ctx, `nouveau-${id}`);
    expect(
      (await db.organization.findUniqueOrThrow({ where: { id: org.id } }))
        .subdomain,
    ).toBe(`nouveau-${id}`);
    expect(
      await db.hostRedirect.count({ where: { organizationId: org.id } }),
    ).toBe(1);
    expect(
      await db.auditLog.count({
        where: {
          organizationId: org.id,
          action: "organization.subdomain_changed",
        },
      }),
    ).toBe(1);
    await changeOrganizationSubdomain(ctx, `nouveau-${id}`);
    expect(
      await db.auditLog.count({
        where: {
          organizationId: org.id,
          action: "organization.subdomain_changed",
        },
      }),
    ).toBe(1);
  });

  it("sous-domaine d'un événement : réservé au Pro ; événement inconnu ; adresse prise refusée ; enregistré puis retiré", async () => {
    const free = await setup();
    await expect(
      setEventSubdomain(free.ctx, free.event.id, "gala"),
    ).rejects.toEqual(refused("PRO_REQUIRED"));
    const { ctx, event, id } = await setup({ pro: true });
    await expect(
      setEventSubdomain(ctx, "evenement-inconnu", "gala"),
    ).rejects.toEqual(refused("NOT_FOUND"));
    await expect(
      setEventSubdomain(ctx, event.id, free.org.subdomain!),
    ).rejects.toEqual(refused("SUBDOMAIN_TAKEN"));
    expect(await setEventSubdomain(ctx, event.id, `gala-${id}`)).toBe(
      `gala-${id}`,
    );
    expect(await setEventSubdomain(ctx, event.id, null)).toBeNull();
    expect(
      (await db.event.findUniqueOrThrow({ where: { id: event.id } })).subdomain,
    ).toBeNull();
  });
});
