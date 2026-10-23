import { canCreateOrganization } from "@evoly/core";
import { findCountry } from "@/lib/countries";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createOrganization, TERMS_VERSION } from "@/server/onboarding";

const rid = () => Math.random().toString(36).slice(2, 10);
const user = () =>
  db.user.create({
    data: {
      name: "Camille",
      email: `cam.${rid()}@exemple.be`,
      emailVerified: true,
    },
  });

describe("création d'une organisation à l'inscription (US-ONB-01, RG-ONB-01, RG-ONB-02, RG-ORG-04)", () => {
  it("organisation créée avec la devise, la langue et le fuseau de son pays, l'offre Free et son créateur propriétaire", async () => {
    const u = await user();
    const sub = `club-${rid()}`;
    const org = await createOrganization(u.id, {
      name: "  Club des Amis  ",
      subdomain: sub,
      country: "BE",
      type: "ASSOCIATION",
    });
    const be = findCountry("BE")!;
    expect(org).toMatchObject({
      name: "Club des Amis",
      slug: sub,
      subdomain: sub,
      type: "ASSOCIATION",
      country: be.code,
      currency: be.currency,
      locale: be.locale,
      timezone: be.timezone,
      termsVersion: TERMS_VERSION,
    });
    expect(org.termsAcceptedAt).not.toBeNull();
    expect(
      await db.subscription.findUniqueOrThrow({
        where: { organizationId: org.id },
      }),
    ).toMatchObject({
      planId: "free",
      status: "NONE",
      currency: be.currency,
    });
    const owner = await db.organizationMember.findFirstOrThrow({
      where: { organizationId: org.id },
      include: { role: true },
    });
    expect([owner.userId, owner.role.systemKey]).toEqual([u.id, "OWNER"]);
  });

  it("pays non proposé : refusé", async () => {
    const u = await user();
    await expect(
      createOrganization(u.id, {
        name: "Club",
        subdomain: `club-${rid()}`,
        country: "ZZ",
        type: "COMPANY",
      }),
    ).rejects.toMatchObject({
      code: "COUNTRY_NOT_AVAILABLE",
    });
  });

  it("sous-domaine invalide ou déjà pris : refusé, avec la raison", async () => {
    const u = await user();
    await expect(
      createOrganization(u.id, {
        name: "Club",
        subdomain: "a",
        country: "BE",
        type: "COMPANY",
      }),
    ).rejects.toMatchObject({
      code: expect.stringMatching(/^SUBDOMAIN_/),
    });
    const sub = `pris-${rid()}`;
    await createOrganization(u.id, {
      name: "Premier",
      subdomain: sub,
      country: "BE",
      type: "COMPANY",
    });
    await expect(
      createOrganization((await user()).id, {
        name: "Second",
        subdomain: sub,
        country: "BE",
        type: "COMPANY",
      }),
    ).rejects.toMatchObject({
      code: "SUBDOMAIN_TAKEN",
    });
  });

  it("seconde organisation gratuite : la règle du paquet core est appliquée ; en Pro, elle ne compte plus", async () => {
    const u = await user();
    const first = await createOrganization(u.id, {
      name: "Première",
      subdomain: `un-${rid()}`,
      country: "BE",
      type: "COMPANY",
    });
    const second = () =>
      createOrganization(u.id, {
        name: "Deuxième",
        subdomain: `deux-${rid()}`,
        country: "BE",
        type: "COMPANY",
      });
    if (
      canCreateOrganization({ ownedFreeOrganizations: 1, startsAsPro: false })
    )
      await expect(second()).resolves.toMatchObject({ name: "Deuxième" });
    else
      await expect(second()).rejects.toMatchObject({
        code: "PRO_REQUIRED_FOR_ANOTHER_ORGANIZATION",
      });
    await db.subscription.update({
      where: { organizationId: first.id },
      data: { planId: "pro", status: "ACTIVE" },
    });
    if (
      canCreateOrganization({ ownedFreeOrganizations: 0, startsAsPro: false })
    )
      await expect(second()).resolves.toMatchObject({ name: "Deuxième" });
  });
});
