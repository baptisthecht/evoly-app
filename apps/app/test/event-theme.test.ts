import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { saveEventTheme, themeForEvent } from "@/server/brand";
import { findOrgContext } from "@/server/context";
import { createOrganization } from "@/server/onboarding";

const rid = () => Math.random().toString(36).slice(2, 8);
async function setup(pro: boolean) {
  await db.promotion.updateMany({ data: { active: false } }); // aucune offre en cours : l'organisation naît bien en Free
  const u = await db.user.create({ data: { name: "Nora", email: `style.${rid()}@exemple.be`, emailVerified: true } });
  const org = await createOrganization(u.id, { name: "Club", subdomain: `club-${rid()}`, country: "BE", type: "ASSOCIATION" } as never);
  if (pro)
    await db.subscription.update({
      where: { organizationId: org.id },
      data: { planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) },
    });
  const ctx = { ...(await findOrgContext(u.id, org.slug))!, user: { id: u.id, name: u.name, email: u.email } } as never;
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `e-${rid()}`,
      publicCode: rid().toUpperCase(),
      title: "Gala",
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 30 * 86_400_000),
    },
  });
  return { ctx, event };
}

describe("style propre à un événement (Pro)", () => {
  it("personnalisé : enregistré ; style de l'organisation : tout effacé ; police d'affiche pour le texte : refusée", async () => {
    const { ctx, event } = await setup(true);
    const saved = await saveEventTheme(ctx, event.id, {
      useOrganization: false,
      accentColor: "#ffd23f",
      backgroundColor: "#1a1033",
      radius: "extra",
      headingFont: "bebas-neue",
      bodyFont: "inter",
      buttonLabel: "Je danse",
    });
    expect([saved.accentColor, saved.backgroundColor, saved.radius, saved.headingFont, saved.buttonLabel]).toEqual([
      "#FFD23F",
      "#1A1033",
      "extra",
      "bebas-neue",
      "Je danse",
    ]);
    const cleared = await saveEventTheme(ctx, event.id, { useOrganization: true, accentColor: "#ffd23f" });
    expect([
      cleared.primaryColor,
      cleared.accentColor,
      cleared.backgroundColor,
      cleared.radius,
      cleared.headingFont,
      cleared.bodyFont,
      cleared.buttonLabel,
    ]).toEqual([null, null, null, null, null, null, null]);
    await expect(saveEventTheme(ctx, event.id, { useOrganization: false, bodyFont: "bebas-neue" })).rejects.toMatchObject({ code: "BRAND_THEME_INVALID" });
  });

  it("organisation Free : refusé", async () => {
    const { ctx, event } = await setup(false);
    await expect(saveEventTheme(ctx, event.id, { useOrganization: false, radius: "soft" })).rejects.toMatchObject({ code: "PRO_REQUIRED" });
  });

  it("fusion : chaque réglage de l'événement remplace celui de la marque ; vide : celui de la marque", () => {
    const brand = { primaryColor: "#222222", accentColor: "#FFB8E8", radius: "round", headingFont: "poppins", displayName: "Club" };
    expect(themeForEvent(brand, { accentColor: "#FFD23F", radius: null, headingFont: "" })).toEqual({ ...brand, accentColor: "#FFD23F" });
    expect(themeForEvent(null, {})).toBeNull();
    expect(themeForEvent(brand, null)).toEqual(brand);
  });
});
