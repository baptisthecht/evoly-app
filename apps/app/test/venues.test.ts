import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { finalizeOrder, reserveOrder } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import {
  activateVenueProgram,
  attachEventToVenue,
  monthlyVenuePayouts,
  netVenueShare,
  payVenueNow,
  setVenueThreshold,
  venueBalance,
  venueSummary,
} from "@/server/venues";

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;

async function organisation(name: string) {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `${name} ${id}`, slug: `org-${id}`, subdomain: `org-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  return { org, ctx };
}
async function evenement(orgId: string, priceMinor: number) {
  const id = rid();
  return db.event.create({
    data: {
      organizationId: orgId,
      slug: `soiree-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Soirée ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 20 * DAY),
      status: "PUBLISHED",
      ticketTypes: { create: { name: "Entrée", priceMinor, currency: "EUR", quantity: 500 } },
    },
    include: { ticketTypes: true },
  });
}
/** Achat réel, payé. */
async function acheter(ev: { id: string; ticketTypes: { id: string }[] }, quantity: number) {
  const r = await reserveOrder({ eventId: ev.id, lines: [{ ticketTypeId: ev.ticketTypes[0]!.id, quantity }], locale: "fr" });
  await db.order.update({ where: { id: r.orderId }, data: { buyerEmail: `acheteur.${rid()}@exemple.be`, buyerFirstName: "Alex", buyerLastName: "Martin" } });
  expect(await finalizeOrder(r.orderId)).toBe("PAID");
  return db.order.findUniqueOrThrow({ where: { id: r.orderId } });
}

describe("lieux partenaires (section 9.32, décision n° 21)", () => {
  it("code unique ; part figée au paiement : rien avant le rattachement, 20 % de la commission après ; détachement ; remboursement déduit ; le lieu ne voit que des totaux", async () => {
    const lieu = await organisation("Le Hangar");
    const orga = await organisation("Nuit Blanche");
    const v = await activateVenueProgram(lieu.ctx);
    expect(v.code).toMatch(/^[A-Z0-9]{8}$/);
    expect((await activateVenueProgram(lieu.ctx)).id).toBe(v.id); // une seule fois
    const ev = await evenement(orga.org.id, 2000);
    const avant = await acheter(ev, 1);
    expect([avant.venuePartnerId, avant.venueShareMinor]).toEqual([null, 0]); // vente antérieure au rattachement : rien
    expect(await attachEventToVenue(orga.ctx, ev.id, v.code.toLowerCase())).toEqual({ name: lieu.org.name });
    const apres = await acheter(ev, 2);
    expect(apres.venuePartnerId).toBe(v.id);
    expect(apres.venueShareMinor).toBe(Math.floor((apres.applicationFeeMinor * 2000) / 10_000));
    expect(apres.venueShareMinor).toBeGreaterThan(0);
    await expect(attachEventToVenue(orga.ctx, ev.id, "INCONNU1")).rejects.toMatchObject({ code: "VENUE_NOT_FOUND" });
    const sienne = await evenement(lieu.org.id, 1000);
    await expect(attachEventToVenue(lieu.ctx, sienne.id, v.code)).rejects.toMatchObject({ code: "VENUE_SELF" });
    // détaché : les parts passées restent, les nouvelles ventes ne rapportent rien
    await attachEventToVenue(orga.ctx, ev.id, null);
    expect((await acheter(ev, 1)).venueShareMinor).toBe(0);
    expect(await venueBalance(v.id)).toBe(apres.venueShareMinor);
    // remboursement d'une partie : déduit au prorata (RG-LIEU-04)
    const rendu = Math.floor(apres.totalMinor / 2);
    await db.order.update({ where: { id: apres.id }, data: { refundedMinor: rendu, status: "PARTIALLY_REFUNDED" } });
    const net = netVenueShare({ totalMinor: apres.totalMinor, refundedMinor: rendu, venueShareMinor: apres.venueShareMinor });
    expect(await venueBalance(v.id)).toBe(net);
    // le lieu ne voit que des totaux (RG-LIEU-05)
    const vu = (await venueSummary(lieu.ctx))!;
    expect(vu).toMatchObject({ code: v.code, events: 0, balanceMinor: net, thresholdEnabled: true, thresholdMinor: 2000 });
    expect(vu.link).toContain(`/register?lieu=${v.code}`);
    expect(vu.months).toEqual([{ month: apres.paidAt!.toISOString().slice(0, 7), tickets: 2, shareMinor: net }]);
    expect(JSON.stringify(vu)).not.toContain("@exemple.be");
    expect(await venueSummary(orga.ctx)).toBeNull(); // l'organisateur n'est pas un lieu
  });

  it("part nette : cas limites", () => {
    expect(netVenueShare({ totalMinor: 1000, refundedMinor: 0, venueShareMinor: 14 })).toBe(14);
    expect(netVenueShare({ totalMinor: 1000, refundedMinor: 1000, venueShareMinor: 14 })).toBe(0); // entièrement remboursée
    expect(netVenueShare({ totalMinor: 1000, refundedMinor: 2000, venueShareMinor: 14 })).toBe(0);
    expect(netVenueShare({ totalMinor: 0, refundedMinor: 0, venueShareMinor: 14 })).toBe(0);
    expect(netVenueShare({ totalMinor: 1000, refundedMinor: 0, venueShareMinor: 0 })).toBe(0); // vente en espèces, sans commission
  });

  it("versements : sous le seuil, reporté ; sans compte Stripe, gardé ; puis versé au bon montant ; « Verser maintenant » dès 1 €, une fois par jour ; seuil réglé par le lieu", async () => {
    const lieu = await organisation("La Cave");
    const orga = await organisation("Festival");
    const v = await activateVenueProgram(lieu.ctx);
    const ev = await evenement(orga.org.id, 10_000);
    await attachEventToVenue(orga.ctx, ev.id, v.code);
    await acheter(ev, 10);
    const solde = await venueBalance(v.id);
    expect(solde).toBeGreaterThan(0);
    expect(solde).toBeLessThan(2000); // sous le seuil de 20 €
    const virements: Array<{ amount: number; currency: string; destination: string }> = [];
    const transfer = async (p: { amount: number; currency: string; destination: string; idempotencyKey: string }) => (virements.push(p), { id: `tr_${rid()}` });
    const pour = async () => (await monthlyVenuePayouts(new Date(), transfer)).results.find((r) => r.id === v.id)!;
    expect((await pour()).status).toBe("CARRIED_OVER"); // reporté au mois suivant
    await expect(setVenueThreshold(lieu.ctx, { enabled: true, amount: "0,5" })).rejects.toMatchObject({ code: "VENUE_THRESHOLD_INVALID" });
    expect((await setVenueThreshold(lieu.ctx, { enabled: true, amount: "35" })).thresholdMinor).toBe(3500);
    await setVenueThreshold(lieu.ctx, { enabled: false, amount: "" });
    expect((await pour()).status).toBe("NO_STRIPE"); // pas de compte Stripe : rien n'est versé, le solde est gardé
    expect(await venueBalance(v.id)).toBe(solde);
    const acct = `acct_${rid()}`;
    await db.stripeAccount.create({ data: { organizationId: lieu.org.id, stripeAccountId: acct, country: "BE", defaultCurrency: "EUR" } });
    expect(await pour()).toMatchObject({ status: "PAID", balanceMinor: solde });
    expect(virements.filter((t) => t.destination === acct)).toEqual([expect.objectContaining({ amount: solde, currency: "eur", destination: acct })]);
    expect(await venueBalance(v.id)).toBe(0);
    // « Verser maintenant » : refusé sous 1 €, puis accepté, puis refusé une seconde fois dans la journée
    await expect(payVenueNow(lieu.ctx, transfer)).rejects.toMatchObject({ code: "VENUE_BALANCE_TOO_LOW" });
    await acheter(ev, 10);
    expect((await payVenueNow(lieu.ctx, transfer)).status).toBe("PAID");
    await acheter(ev, 10);
    await expect(payVenueNow(lieu.ctx, transfer)).rejects.toMatchObject({ code: "VENUE_PAYOUT_TOO_SOON" });
  });
});
