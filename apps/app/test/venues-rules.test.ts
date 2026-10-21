import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { OrgContext } from "@/server/context";
import { activateVenueProgram, attachVenueReferral, payVenue, setVenueHall, setVenueThreshold } from "@/server/venues";

// lieux partenaires (section 9.32, RG-LIEU-01, 06 et 07) : activation, seuil, salle, parrainage, versement à la demande
const rid = () => Math.random().toString(36).slice(2, 10);
async function organization(country = "BE") {
  const id = rid();
  const org = await db.organization.create({
    data: { name: `Lieu ${id}`, slug: `lieu-${id}`, subdomain: `lieu-${id}`, country, currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  return { org, ctx: { organization: org, user: { id: "u" } } as unknown as OrgContext };
}
const refused = (code: string) => expect.objectContaining({ code });

describe("lieux partenaires : activation du programme", () => {
  it("réservé aux lieux en Belgique ; code unique attribué, jamais dupliqué ; programme désactivé : réactivé", async () => {
    const fr = await organization("FR");
    await expect(activateVenueProgram(fr.ctx)).rejects.toEqual(refused("VENUE_COUNTRY_UNSUPPORTED"));
    const { org, ctx } = await organization();
    const v = await activateVenueProgram(ctx);
    expect(v.code).toMatch(/^[A-Z0-9]{8}$/);
    expect((await activateVenueProgram(ctx)).id).toBe(v.id);
    await db.venuePartner.update({ where: { id: v.id }, data: { active: false } });
    expect(await activateVenueProgram(ctx)).toMatchObject({ id: v.id, active: true });
    expect(await db.venuePartner.count({ where: { organizationId: org.id } })).toBe(1);
  });
});

describe("lieux partenaires : réglages", () => {
  it("seuil : lieu inconnu introuvable ; hors de 1 € à 10 000 € refusé ; virgule acceptée ; désactivé : montant ignoré", async () => {
    const none = await organization();
    await expect(setVenueThreshold(none.ctx, { enabled: true, amount: "50" })).rejects.toEqual(refused("NOT_FOUND"));
    const { ctx } = await organization();
    await activateVenueProgram(ctx);
    for (const amount of ["0,50", "20000", "beaucoup"])
      await expect(setVenueThreshold(ctx, { enabled: true, amount })).rejects.toEqual(refused("VENUE_THRESHOLD_INVALID"));
    expect(await setVenueThreshold(ctx, { enabled: true, amount: " 25,50 " })).toMatchObject({ thresholdEnabled: true, thresholdMinor: 2550 });
    expect(await setVenueThreshold(ctx, { enabled: false, amount: "n'importe quoi" })).toMatchObject({ thresholdEnabled: false, thresholdMinor: 2550 });
  });

  it("salle : lieu inconnu introuvable ; adresse obligatoire ; enregistrée", async () => {
    const hall = { hallName: "Grande salle", addressLine1: "Rue de la Station 12", postalCode: "7700", city: "Mouscron", country: "BE" };
    const none = await organization();
    await expect(setVenueHall(none.ctx, hall)).rejects.toEqual(refused("NOT_FOUND"));
    const { ctx } = await organization();
    await activateVenueProgram(ctx);
    await expect(setVenueHall(ctx, { ...hall, addressLine1: "   " })).rejects.toEqual(refused("VENUE_HALL_INVALID"));
    expect(await setVenueHall(ctx, hall)).toMatchObject({ hallName: "Grande salle", addressLine1: "Rue de la Station 12", city: "Mouscron" });
  });
});

describe("lieux partenaires : parrainage", () => {
  it("code vide, inconnu ou du lieu lui-même : ignoré ; rattachement unique, jamais remplacé", async () => {
    const lieu = await organization();
    const autre = await organization();
    const v = await activateVenueProgram(lieu.ctx);
    const w = await activateVenueProgram(autre.ctx);
    const organizer = await organization();
    expect(await attachVenueReferral(organizer.org.id, "   ")).toBeNull();
    expect(await attachVenueReferral(organizer.org.id, "INCONNU1")).toBeNull();
    expect(await attachVenueReferral(lieu.org.id, v.code)).toBeNull();
    expect(await attachVenueReferral(organizer.org.id, ` ${v.code.toLowerCase()} `)).toBe(v.id);
    expect(await attachVenueReferral(organizer.org.id, w.code)).toBeNull();
    expect((await db.organization.findUniqueOrThrow({ where: { id: organizer.org.id } })).referredByVenueId).toBe(v.id);
  });
});

describe("lieux partenaires : versement", () => {
  it("à la demande avec un solde trop bas : refusé ; automatique sans solde : reporté", async () => {
    const { ctx } = await organization();
    const v = await activateVenueProgram(ctx);
    await expect(payVenue(v.id, { manual: true })).rejects.toEqual(refused("VENUE_BALANCE_TOO_LOW"));
    expect(await payVenue(v.id, { manual: false })).toEqual({ status: "CARRIED_OVER", balanceMinor: 0 });
  });
});
