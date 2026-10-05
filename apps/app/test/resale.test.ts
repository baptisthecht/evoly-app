import { describe, expect, it } from "vitest";
import { ticketCommission } from "@evoly/core";
import { db } from "@/lib/db";
import { cancelReservation, finalizeOrder, releaseExpiredHolds, reserveOrder, submitBuyer } from "@/server/checkout";
import { afterOrderPaid } from "@/server/orders";
import { getPlans } from "@/server/plans";
import { cancelListingsForEvent, createListing, expireResaleListings, reserveResale, withdrawListing } from "@/server/resale";
import { checkIn, resolveScannerLink, scannerToken } from "@/server/scanner";

const rid = () => Math.random().toString(36).slice(2, 10);
const buyerB = (id: string) => ({ firstName: "Tom", lastName: "Dubois", email: `tom.${id}@exemple.be`, marketingOptIn: false });

/** Événement publié et un billet acheté par Léa : gratuit (priceMinor 0) ou payé (paiement simulé). */
async function setup(priceMinor: number, opts: { nominative?: boolean } = {}) {
  const id = rid();
  const org = await db.organization.create({
    data: { name: `Test ${id}`, slug: `test-${id}`, subdomain: `test-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  if (priceMinor > 0)
    await db.stripeAccount.create({
      data: {
        organizationId: org.id,
        stripeAccountId: `acct_${id}`,
        country: "BE",
        defaultCurrency: "EUR",
        status: "ACTIVE",
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      },
    });
  const startsAt = new Date(Date.now() + 3 * 86_400_000);
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `concert-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Concert ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt,
      status: "PUBLISHED",
      ticketTypes: { create: { name: "Fosse", priceMinor, currency: "EUR", quantity: 100, isNominative: opts.nominative ?? false } },
    },
    include: { ticketTypes: true },
  });
  const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" });
  const holders = opts.nominative ? { [r.lines[0]!.orderItemId]: [{ firstName: "Léa", lastName: "Martin" }] } : undefined;
  if (priceMinor === 0) await submitBuyer(r.token, { firstName: "Léa", lastName: "Martin", email: `lea.${id}@exemple.be`, marketingOptIn: false, holders });
  else {
    await db.order.update({ where: { id: r.orderId }, data: { buyerFirstName: "Léa", buyerLastName: "Martin", buyerEmail: `lea.${id}@exemple.be` } });
    expect(
      await finalizeOrder(r.orderId, {
        paymentIntentId: `pi_${id}`,
        amountMinor: priceMinor,
        currency: "eur",
        chargeId: `ch_${id}`,
        paymentMethodType: "card",
      }),
    ).toBe("PAID");
  }
  const ticket = await db.ticket.findFirstOrThrow({ where: { orderId: r.orderId } });
  return { id, org, event, ticketType: event.ticketTypes[0]!, sellerToken: r.token, sellerOrderId: r.orderId, ticket, startsAt };
}

describe("mise en vente (RG-RSL-01 à 05)", () => {
  it("prix plafonné à la valeur faciale, une seule annonce ouverte, fin de revente 2 heures avant", async () => {
    const s = await setup(2400);
    await expect(createListing(s.sellerToken, s.ticket.id, "30")).rejects.toThrow("RESALE_ABOVE_FACE_VALUE");
    const listing = await createListing(s.sellerToken, s.ticket.id, "20");
    expect(listing).toMatchObject({ status: "ACTIVE", priceMinor: 2000, faceValueMinor: 2400 });
    expect(listing.expiresAt.getTime()).toBe(s.startsAt.getTime() - 2 * 3_600_000);
    await expect(createListing(s.sellerToken, s.ticket.id, "20")).rejects.toThrow("RESALE_ALREADY_LISTED");
    // défense en profondeur : la base refuse aussi un prix au-dessus de la valeur faciale
    await expect(db.resaleListing.update({ where: { id: listing.id }, data: { priceMinor: 3000 } })).rejects.toThrow();
  });
});

describe("achat d'une place en revente (section 9.13)", () => {
  it("transfert gratuit : ancien billet revendu, nouveau billet au nom de l'acheteur, aucune place vendue en plus", async () => {
    const s = await setup(0, { nominative: true });
    const listing = await createListing(s.sellerToken, s.ticket.id, "0");
    const r = await reserveResale(listing.linkCode, "fr");
    expect(r).toMatchObject({ isFree: true, totalMinor: 0 });
    expect(r.lines[0]!.nominative).toBe(false);
    expect(await submitBuyer(r.token, buyerB(s.id))).toEqual({ kind: "PAID" });
    const old = await db.ticket.findUniqueOrThrow({ where: { id: s.ticket.id } });
    expect(old).toMatchObject({ status: "VOID", voidReason: "RESOLD" });
    const fresh = await db.ticket.findFirstOrThrow({ where: { orderId: r.orderId } });
    expect(fresh).toMatchObject({ status: "VALID", replacesTicketId: s.ticket.id, holderFirstName: "Tom", holderLastName: "Dubois", faceValueMinor: 0 });
    expect(fresh.code).not.toBe(s.ticket.code);
    expect(await db.resaleListing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: "SOLD", sellerRefundMinor: 0 });
    expect((await db.ticketType.findUniqueOrThrow({ where: { id: s.ticketType.id } })).quantitySold).toBe(1);
    expect(await db.emailMessage.count({ where: { template: "resale.sold", toEmail: listing.sellerEmail } })).toBe(1);
  });

  it("réservation exclusive, puis annonce rendue quand la réservation expire", async () => {
    const s = await setup(0);
    const listing = await createListing(s.sellerToken, s.ticket.id, "0");
    const both = await Promise.allSettled([reserveResale(listing.linkCode, "fr"), reserveResale(listing.linkCode, "fr")]);
    expect(both.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((both.find((x) => x.status === "rejected") as PromiseRejectedResult).reason.message).toBe("RESALE_RESERVED");
    await expect(withdrawListing(s.sellerToken, listing.id)).rejects.toThrow("RESALE_RESERVED"); // RG-RSL-07
    const first = (both.find((x) => x.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof reserveResale>>>).value;
    await db.order.update({ where: { id: first.orderId }, data: { holdExpiresAt: new Date(Date.now() - 1000) } });
    await releaseExpiredHolds();
    expect((await db.resaleListing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("ACTIVE");
    const second = await reserveResale(listing.linkCode, "fr");
    expect((await db.order.findUniqueOrThrow({ where: { id: first.orderId } })).resaleListingId).toBeNull();
    await cancelReservation(second.token);
    await withdrawListing(s.sellerToken, listing.id);
    expect((await db.resaleListing.findUniqueOrThrow({ where: { id: listing.id } })).status).toBe("CANCELLED");
  });

  it("revente payante : commission sur le prix de revente ; sans Stripe, l'annonce passe FAILED et l'acheteur garde son billet (RG-RSL-06)", async () => {
    const s = await setup(2400);
    const listing = await createListing(s.sellerToken, s.ticket.id, "20");
    const r = await reserveResale(listing.linkCode, "fr");
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });
    expect(order).toMatchObject({ source: "RESALE", totalMinor: 2000, applicationFeeMinor: ticketCommission(2000, (await getPlans()).free.terms.EUR!) });
    await db.order.update({ where: { id: r.orderId }, data: { buyerFirstName: "Tom", buyerLastName: "Dubois", buyerEmail: `tom.${s.id}@exemple.be` } });
    expect(
      await finalizeOrder(r.orderId, { paymentIntentId: `pi_b_${s.id}`, amountMinor: 2000, currency: "eur", chargeId: null, paymentMethodType: "card" }),
    ).toBe("PAID");
    await afterOrderPaid(r.orderId);
    expect(await db.resaleListing.findUniqueOrThrow({ where: { id: listing.id } })).toMatchObject({ status: "FAILED", sellerRefundMinor: null });
    expect((await db.ticket.findFirstOrThrow({ where: { orderId: r.orderId } })).status).toBe("VALID");
    expect((await db.ticket.findUniqueOrThrow({ where: { id: s.ticket.id } })).status).toBe("VOID");
  });
});

describe("fermeture des annonces (RG-RSL-08, RG-RSL-09)", () => {
  it("billet scanné, revente désactivée par l'organisateur, fin de la revente", async () => {
    const a = await setup(0);
    const la = await createListing(a.sellerToken, a.ticket.id, "0");
    const user = await db.user.create({ data: { name: "Camille", email: `cam.${a.id}@exemple.be`, emailVerified: true } });
    const link = await db.scannerLink.create({
      data: {
        id: `c${a.id}scan0000000000000`,
        eventId: a.event.id,
        tokenHash: "x",
        label: "Porte",
        expiresAt: new Date(Date.now() + 86_400_000),
        createdById: user.id,
      },
    });
    const { createHash } = await import("node:crypto");
    await db.scannerLink.update({ where: { id: link.id }, data: { tokenHash: createHash("sha256").update(scannerToken(link.id)).digest("hex") } });
    const resolved = await resolveScannerLink(scannerToken(link.id));
    expect((await checkIn(resolved!.link, { code: a.ticket.code, method: "QR" })).result).toBe("VALID");
    expect((await db.resaleListing.findUniqueOrThrow({ where: { id: la.id } })).status).toBe("CANCELLED");

    const b = await setup(0);
    const lb = await createListing(b.sellerToken, b.ticket.id, "0");
    expect(await cancelListingsForEvent(b.event.id)).toBe(1);
    expect((await db.resaleListing.findUniqueOrThrow({ where: { id: lb.id } })).status).toBe("CANCELLED");
    expect(await db.emailMessage.count({ where: { template: "resale.cancelled", toEmail: lb.sellerEmail } })).toBe(1);

    const c = await setup(0);
    const lc = await createListing(c.sellerToken, c.ticket.id, "0");
    await db.resaleListing.update({ where: { id: lc.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await expireResaleListings()).toBeGreaterThanOrEqual(1);
    expect((await db.resaleListing.findUniqueOrThrow({ where: { id: lc.id } })).status).toBe("EXPIRED");
  });
});
