import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { finalizeOrder, reserveOrder } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import { createEvent } from "@/server/events";
import {
  acceptSelfBilling,
  activateVenueProgram,
  attachVenueReferral,
  monthlyVenuePayouts,
  netVenueShare,
  payVenueNow,
  referringVenueName,
  selfBillingPdf,
  setVenueHall,
  setVenueThreshold,
  venueBalance,
  venueShareVat,
  venueSummary,
} from "@/server/venues";

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;
const local = (d: Date) => d.toISOString().slice(0, 16);

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
type Ctx = Awaited<ReturnType<typeof organisation>>["ctx"];
/** Un lieu actif avec sa salle, et un organisateur inscrit par son lien. */
async function lieuEtOrganisateur() {
  const lieu = await organisation("Le Hangar");
  const v = await activateVenueProgram(lieu.ctx);
  await setVenueHall(lieu.ctx, { hallName: "Le Hangar", addressLine1: "Rue du Port 12", postalCode: "1000", city: "Bruxelles", country: "be" });
  // RG-LIEU-07 : informations de facturation et accord d'autofacturation, conditions de tout versement
  await db.organization.update({
    where: { id: lieu.org.id },
    data: { legalName: "Le Hangar SRL", addressLine1: "Rue du Port 12", postalCode: "1000", city: "Bruxelles" },
  });
  await acceptSelfBilling(lieu.ctx);
  const orga = await organisation("Nuit Blanche");
  expect(await attachVenueReferral(orga.org.id, v.code)).toBe(v.id);
  return { lieu, orga, v };
}
/** Événement créé par la vraie fonction de création, dans la salle du lieu ou ailleurs, puis publié. */
async function evenement(ctx: Ctx, atVenue: boolean, price = "20") {
  const e = await createEvent(
    ctx,
    {
      title: `Soirée ${rid()}`,
      startsAtLocal: local(new Date(Date.now() + 20 * DAY)),
      timezone: "Europe/Brussels",
      locationType: "PHYSICAL",
      locationName: "Ailleurs",
      addressLine1: "Avenue Louise 1",
      city: "Bruxelles",
      atVenue,
    },
    { name: "Entrée", price, quantity: 500 },
  );
  await db.event.update({ where: { id: e.id }, data: { status: "PUBLISHED" } });
  return db.event.findUniqueOrThrow({ where: { id: e.id }, include: { ticketTypes: true } });
}
/** Achat réel, payé. */
async function acheter(ev: { id: string; ticketTypes: { id: string }[] }, quantity: number) {
  const r = await reserveOrder({ eventId: ev.id, lines: [{ ticketTypeId: ev.ticketTypes[0]!.id, quantity }], locale: "fr" });
  await db.order.update({ where: { id: r.orderId }, data: { buyerEmail: `acheteur.${rid()}@exemple.be`, buyerFirstName: "Alex", buyerLastName: "Martin" } });
  expect(await finalizeOrder(r.orderId)).toBe("PAID");
  return db.order.findUniqueOrThrow({ where: { id: r.orderId } });
}

describe("lieux partenaires (section 9.32, décisions du 19 octobre 2026)", () => {
  it("seuls les événements qui ont lieu dans la salle comptent, sans code : salle proposée et appliquée ; ailleurs, rien ; organisateur non parrainé, rien ; remboursement déduit ; le lieu ne voit que des totaux", async () => {
    const { lieu, orga, v } = await lieuEtOrganisateur();
    const chez = await evenement(orga.ctx, true);
    expect([chez.venuePartnerId, chez.locationName, chez.addressLine1, chez.postalCode, chez.city, chez.country]).toEqual([
      v.id,
      "Le Hangar",
      "Rue du Port 12",
      "1000",
      "Bruxelles",
      "BE",
    ]);
    const ailleurs = await evenement(orga.ctx, false);
    expect([ailleurs.venuePartnerId, ailleurs.addressLine1]).toEqual([null, "Avenue Louise 1"]);
    const seul = await organisation("Indépendant");
    expect((await evenement(seul.ctx, true)).venuePartnerId).toBeNull(); // pas parrainé : la case ne rattache rien
    const a = await acheter(chez, 2);
    const b = await acheter(ailleurs, 2);
    expect(a.venuePartnerId).toBe(v.id);
    expect(a.venueShareMinor).toBe(Math.floor((a.applicationFeeMinor * 2000) / 10_000));
    expect(a.venueShareMinor).toBeGreaterThan(0);
    expect([b.venuePartnerId, b.venueShareMinor]).toEqual([null, 0]); // ailleurs : rien
    // l'événement n'a plus lieu dans la salle : les ventes passées restent, les nouvelles ne rapportent rien
    await db.event.update({ where: { id: chez.id }, data: { venuePartnerId: null } });
    expect((await acheter(chez, 1)).venueShareMinor).toBe(0);
    expect(await venueBalance(v.id)).toBe(a.venueShareMinor);
    // remboursement d'une partie : déduit au prorata (RG-LIEU-04)
    const rendu = Math.floor(a.totalMinor / 2);
    await db.order.update({ where: { id: a.id }, data: { refundedMinor: rendu, status: "PARTIALLY_REFUNDED" } });
    const net = netVenueShare({ totalMinor: a.totalMinor, refundedMinor: rendu, venueShareMinor: a.venueShareMinor });
    expect(await venueBalance(v.id)).toBe(net);
    // le lieu ne voit que des totaux (RG-LIEU-05)
    const vu = (await venueSummary(lieu.ctx))!;
    expect(vu).toMatchObject({
      code: v.code,
      organizers: 1,
      balanceMinor: net,
      thresholdEnabled: true,
      thresholdMinor: 2000,
      hall: { name: "Le Hangar", addressLine1: "Rue du Port 12" },
    });
    expect(vu.link).toContain(`/register?lieu=${v.code}`);
    expect(vu.months).toEqual([{ month: a.paidAt!.toISOString().slice(0, 7), tickets: 2, shareMinor: net }]);
    expect(JSON.stringify(vu)).not.toContain("@exemple.be");
    expect(await venueSummary(orga.ctx)).toBeNull(); // l'organisateur n'est pas un lieu
  });

  it("salle : l'adresse est obligatoire ; sans adresse, la salle n'est pas proposée et rien n'est rattaché", async () => {
    const lieu = await organisation("Sans adresse");
    const v = await activateVenueProgram(lieu.ctx);
    await expect(setVenueHall(lieu.ctx, { hallName: "Salle", addressLine1: " ", postalCode: "", city: "", country: "" })).rejects.toMatchObject({
      code: "VENUE_HALL_INVALID",
    });
    const orga = await organisation("Orga");
    await attachVenueReferral(orga.org.id, v.code);
    expect((await evenement(orga.ctx, true)).venuePartnerId).toBeNull();
  });

  it("part nette : cas limites", () => {
    expect(netVenueShare({ totalMinor: 1000, refundedMinor: 0, venueShareMinor: 14 })).toBe(14);
    expect(netVenueShare({ totalMinor: 1000, refundedMinor: 1000, venueShareMinor: 14 })).toBe(0); // entièrement remboursée
    expect(netVenueShare({ totalMinor: 1000, refundedMinor: 2000, venueShareMinor: 14 })).toBe(0);
    expect(netVenueShare({ totalMinor: 0, refundedMinor: 0, venueShareMinor: 14 })).toBe(0);
    expect(netVenueShare({ totalMinor: 1000, refundedMinor: 0, venueShareMinor: 0 })).toBe(0); // vente en espèces, sans commission
  });

  it("versements : sous le seuil, reporté ; sans compte Stripe, gardé ; puis versé au bon montant ; « Verser maintenant » dès 1 €, une fois par jour ; seuil réglé par le lieu", async () => {
    const { lieu, orga, v } = await lieuEtOrganisateur();
    const ev = await evenement(orga.ctx, true, "100");
    await acheter(ev, 10);
    const solde = await venueBalance(v.id);
    expect(solde).toBeGreaterThan(0);
    expect(solde).toBeLessThan(2000); // sous le seuil de 20 €
    const virements: Array<{ amount: number; currency: string; destination: string }> = [];
    const transfer = async (p: { amount: number; currency: string; destination: string; idempotencyKey: string }) => (virements.push(p), { id: `tr_${rid()}` });
    const pour = async () => (await monthlyVenuePayouts(new Date(), transfer)).results.find((r) => r.id === v.id)!;
    expect((await pour()).status).toBe("CARRIED_OVER");
    await expect(setVenueThreshold(lieu.ctx, { enabled: true, amount: "0,5" })).rejects.toMatchObject({ code: "VENUE_THRESHOLD_INVALID" });
    expect((await setVenueThreshold(lieu.ctx, { enabled: true, amount: "35" })).thresholdMinor).toBe(3500);
    await setVenueThreshold(lieu.ctx, { enabled: false, amount: "" });
    expect((await pour()).status).toBe("NO_STRIPE");
    expect(await venueBalance(v.id)).toBe(solde);
    const acct = `acct_${rid()}`;
    await db.stripeAccount.create({ data: { organizationId: lieu.org.id, stripeAccountId: acct, country: "BE", defaultCurrency: "EUR" } });
    expect(await pour()).toMatchObject({ status: "PAID", balanceMinor: solde });
    expect(virements.filter((t) => t.destination === acct)).toEqual([expect.objectContaining({ amount: solde, currency: "eur", destination: acct })]);
    expect(await venueBalance(v.id)).toBe(0);
    await expect(payVenueNow(lieu.ctx, transfer)).rejects.toMatchObject({ code: "VENUE_BALANCE_TOO_LOW" });
    await acheter(ev, 10);
    expect((await payVenueNow(lieu.ctx, transfer)).status).toBe("PAID");
    await acheter(ev, 10);
    await expect(payVenueNow(lieu.ctx, transfer)).rejects.toMatchObject({ code: "VENUE_PAYOUT_TOO_SOON" });
  });

  it("lien d'inscription : l'organisateur rattaché au lieu une fois pour toutes, à cette date ; code inconnu ignoré ; jamais remplacé ; pas le lieu lui-même", async () => {
    const lieu = await organisation("Le Hangar");
    const autreLieu = await organisation("La Cave");
    const v = await activateVenueProgram(lieu.ctx);
    const w = await activateVenueProgram(autreLieu.ctx);
    expect((await activateVenueProgram(lieu.ctx)).id).toBe(v.id); // une seule fois
    expect(v.code).toMatch(/^[A-Z0-9]{8}$/);
    const orga = await organisation("Nuit Blanche");
    expect(await attachVenueReferral(orga.org.id, "INCONNU1")).toBeNull();
    expect(await attachVenueReferral(orga.org.id, null)).toBeNull();
    const quand = new Date("2026-10-19T10:00:00Z");
    expect(await attachVenueReferral(orga.org.id, v.code.toLowerCase(), quand)).toBe(v.id);
    expect(await attachVenueReferral(orga.org.id, w.code)).toBeNull();
    expect(await db.organization.findUniqueOrThrow({ where: { id: orga.org.id }, select: { referredByVenueId: true, referredByVenueAt: true } })).toEqual({
      referredByVenueId: v.id,
      referredByVenueAt: quand,
    });
    expect(await attachVenueReferral(lieu.org.id, v.code)).toBeNull();
    expect((await venueSummary(lieu.ctx))!.organizers).toBe(1);
  });

  it("relevé envoyé au lieu à chaque versement réussi, mensuel ou à la demande (RG-LIEU-06) ; l'organisateur sait à quel lieu il est rattaché (US-LIEU-03)", async () => {
    const { lieu, orga, v } = await lieuEtOrganisateur();
    expect(await referringVenueName(orga.org.id)).toBe("Le Hangar");
    expect(await referringVenueName(lieu.org.id)).toBeNull();
    const ev = await evenement(orga.ctx, true, "100");
    await acheter(ev, 10);
    await setVenueThreshold(lieu.ctx, { enabled: false, amount: "" });
    await db.stripeAccount.create({ data: { organizationId: lieu.org.id, stripeAccountId: `acct_${rid()}`, country: "BE", defaultCurrency: "EUR" } });
    const transfer = async () => ({ id: `tr_${rid()}` });
    const releves = () => db.emailMessage.count({ where: { organizationId: lieu.org.id, template: "venue.payout" } });
    expect((await monthlyVenuePayouts(new Date(), transfer)).results.find((r) => r.id === v.id)!.status).toBe("PAID");
    expect(await releves()).toBe(1);
    await acheter(ev, 10);
    expect((await payVenueNow(lieu.ctx, transfer)).status).toBe("PAID");
    expect(await releves()).toBe(2);
    expect(await venueBalance(v.id)).toBe(0);
  });

  it("fiscalité (RG-LIEU-07, décidée au mieux) : TVA comprise ; lieux en Belgique ; aucun versement sans accord d'autofacturation ni informations de facturation ; facture numérotée pour le lieu", async () => {
    expect(venueShareVat(1210, { vatRegistered: true, vatNumber: "BE0123456789" })).toEqual({
      netMinor: 1000,
      vatMinor: 210,
      vatRateBps: 2100,
      mention: "BE_VAT",
    });
    expect(venueShareVat(1000, { vatRegistered: false, vatNumber: "BE0123456789" })).toEqual({
      netMinor: 1000,
      vatMinor: 0,
      vatRateBps: 0,
      mention: "FRANCHISE",
    });
    expect(venueShareVat(1000, { vatRegistered: false, vatNumber: null })).toMatchObject({ vatMinor: 0, mention: "NOT_REGISTERED" });
    const fr = await organisation("Salle française");
    await expect(activateVenueProgram({ ...fr.ctx, organization: { ...fr.ctx.organization, country: "FR" } })).rejects.toMatchObject({
      code: "VENUE_COUNTRY_UNSUPPORTED",
    });
    const lieu = await organisation("Le Dôme");
    const v = await activateVenueProgram(lieu.ctx);
    await setVenueHall(lieu.ctx, { hallName: "Le Dôme", addressLine1: "Place 1", postalCode: "7700", city: "Mouscron", country: "BE" });
    await setVenueThreshold(lieu.ctx, { enabled: false, amount: "" });
    await db.stripeAccount.create({ data: { organizationId: lieu.org.id, stripeAccountId: `acct_${rid()}`, country: "BE", defaultCurrency: "EUR" } });
    const orga = await organisation("Orga");
    await attachVenueReferral(orga.org.id, v.code);
    const ev = await evenement(orga.ctx, true, "100");
    await acheter(ev, 10);
    const transfer = async () => ({ id: `tr_${rid()}` });
    const run = async () => (await monthlyVenuePayouts(new Date(), transfer)).results.find((r) => r.id === v.id)!.status;
    expect(await run()).toBe("INFO_MISSING");
    await expect(payVenueNow(lieu.ctx, transfer)).rejects.toMatchObject({ code: "VENUE_BILLING_INFO" });
    await db.organization.update({
      where: { id: lieu.org.id },
      data: { legalName: "Le Dôme SRL", addressLine1: "Place 1", postalCode: "7700", city: "Mouscron", vatRegistered: true, vatNumber: "BE0123456789" },
    });
    expect(await run()).toBe("INFO_MISSING"); // toujours sans accord
    await acceptSelfBilling(lieu.ctx);
    expect(await run()).toBe("PAID");
    const p1 = await db.venuePayout.findFirstOrThrow({ where: { venuePartnerId: v.id, status: "PAID" } });
    expect([p1.invoiceNumber, p1.vatMention, p1.netMinor! + p1.vatMinor!]).toEqual([`AF-${v.code}-0001`, "BE_VAT", p1.amountMinor]);
    const pdf = (await selfBillingPdf(p1.id))!;
    expect(pdf.number).toBe(p1.invoiceNumber);
    expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBe(1);
    await acheter(ev, 10);
    await payVenueNow(lieu.ctx, transfer);
    expect(
      (await db.venuePayout.findMany({ where: { venuePartnerId: v.id, status: "PAID" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })).map(
        (p) => p.invoiceNumber,
      ),
    ).toEqual([`AF-${v.code}-0001`, `AF-${v.code}-0002`]);
    expect(await db.emailMessage.count({ where: { organizationId: lieu.org.id, template: "venue.payout" } })).toBe(2);
  });
});
