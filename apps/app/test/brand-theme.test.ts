import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { normalizeSocialLinks, saveBrand } from "@/server/brand";
import { findOrgContext } from "@/server/context";
import { createOrganization } from "@/server/onboarding";

const rid = () => Math.random().toString(36).slice(2, 8);
async function proContext() {
  const u = await db.user.create({
    data: {
      name: "Nora",
      email: `marque.${rid()}@exemple.be`,
      emailVerified: true,
    },
  });
  const org = await createOrganization(u.id, {
    name: "Club",
    subdomain: `club-${rid()}`,
    country: "BE",
    type: "ASSOCIATION",
  } as never);
  await db.subscription.update({
    where: { organizationId: org.id },
    data: {
      planId: "pro",
      status: "ACTIVE",
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
    },
  });
  return {
    ...(await findOrgContext(u.id, org.slug))!,
    user: { id: u.id, name: u.name, email: u.email },
  } as never;
}

describe("personnalisation de la billetterie : contrôles du serveur", () => {
  it("liens sociaux : https complété, domaine du réseau exigé, http refusé, champs vides ignorés", () => {
    expect(
      normalizeSocialLinks({
        instagram: "instagram.com/club",
        website: "https://club.be",
        facebook: "",
      }),
    ).toEqual({
      website: "https://club.be/",
      instagram: "https://instagram.com/club",
    });
    expect(() =>
      normalizeSocialLinks({ instagram: "https://exemple.be/club" }),
    ).toThrow();
    expect(() => normalizeSocialLinks({ website: "http://club.be" })).toThrow();
    expect(normalizeSocialLinks({ website: "  " })).toBeNull();
  });

  it("thème enregistré ; police d'affiche pour le texte ou arrondi inconnu : refusés", async () => {
    const ctx = await proContext();
    const brand = await saveBrand(ctx, {
      hideEvolyBranding: true,
      backgroundColor: "#faf7f2",
      radius: "soft",
      headingFont: "playfair-display",
      bodyFont: "lora",
      buttonLabel: "  Je participe  ",
      socialLinks: { instagram: "instagram.com/club" },
    });
    expect([
      brand.backgroundColor,
      brand.radius,
      brand.headingFont,
      brand.bodyFont,
      brand.buttonLabel,
    ]).toEqual(["#FAF7F2", "soft", "playfair-display", "lora", "Je participe"]);
    expect(brand.socialLinks).toEqual({
      instagram: "https://instagram.com/club",
    });
    await expect(
      saveBrand(ctx, { hideEvolyBranding: true, bodyFont: "bebas-neue" }),
    ).rejects.toMatchObject({ code: "BRAND_THEME_INVALID" });
    await expect(
      saveBrand(ctx, { hideEvolyBranding: true, radius: "triangle" }),
    ).rejects.toMatchObject({ code: "BRAND_THEME_INVALID" });
  });
});
