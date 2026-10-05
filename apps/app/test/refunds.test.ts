import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { finalizeOrder, findOrderIdByToken, orderAccessToken, reserveOrder, submitBuyer } from "@/server/checkout";
import type { OrgContext } from "@/server/context";
import { correctBuyerEmail, searchOrders } from "@/server/ordersAdmin";
import { approveRefund, cancelEvent, refundTickets, requestRefund, retryRefund } from "@/server/refunds";
import { createListing } from "@/server/resale";

const rid = () => Math.random().toString(36).slice(2, 10);
type Policy = "NON_REFUNDABLE" | "UNTIL_DEADLINE" | "ON_REQUEST" | "ALWAYS";

async function setup(opts: { policy: Policy; priceMinor?: number; quantity?: number }) {
  const id = rid();
  const user = await db.user.create({ data: { name: "Camille Dupont", email: `org.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Test ${id}`, slug: `test-${id}`, subdomain: `test-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const price = opts.priceMinor ?? 0;
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `soiree-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Soirée ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 5 * 86_400_000),
      status: "PUBLISHED",
      refundPolicy: opts.policy,
      ticketTypes: { create: { name: "Fosse", priceMinor: price, currency: "EUR", quantity: 50 } },
    },
    include: { ticketTypes: true },
  });
  const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: opts.quantity ?? 2 }], locale: "fr" });
  const email = `lea.${id}@exemple.be`;
  if (price === 0) await submitBuyer(r.token, { firstName: "Léa", lastName: "Martin", email, marketingOptIn: false });
  else {
    await db.order.update({ where: { id: r.orderId }, data: { buyerFirstName: "Léa", buyerLastName: "Martin", buyerEmail: email } });
    await finalizeOrder(r.orderId, {
      paymentIntentId: `pi_${id}`,
      amountMinor: price * (opts.quantity ?? 2),
      currency: "eur",
      chargeId: `ch_${id}`,
      paymentMethodType: "card",
    });
  }
  const tickets = await db.ticket.findMany({ where: { orderId: r.orderId }, orderBy: { createdAt: "asc" } });
  const ctx = { organization: { id: org.id }, user: { id: user.id } } as unknown as OrgContext;
  return { id, ctx, org, event, ticketType: event.ticketTypes[0]!, token: r.token, orderId: r.orderId, tickets, email };
}
const ticket = (id: string) => db.ticket.findUniqueOrThrow({ where: { id } });

describe("demandes de remboursement (RG-REF-01 à 05)", () => {
  it("politique « toujours » : acceptée d'office, billet désactivé, place remise en vente", async () => {
    const s = await setup({ policy: "ALWAYS" });
    expect(await requestRefund(s.token, [s.tickets[0]!.id], "Empêchée")).toMatchObject({ automatic: true });
    expect((await ticket(s.tickets[0]!.id)).status).toBe("REFUNDED");
    expect((await ticket(s.tickets[1]!.id)).status).toBe("VALID");
    expect((await db.ticketType.findUniqueOrThrow({ where: { id: s.ticketType.id } })).quantitySold).toBe(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: s.orderId } })).status).toBe("PARTIALLY_REFUNDED");
    expect(await db.refund.findFirstOrThrow({ where: { orderId: s.orderId } })).toMatchObject({ status: "SUCCEEDED", initiator: "BUYER", amountMinor: 0 });
    expect(await db.emailMessage.count({ where: { orderId: s.orderId, template: "refund.processed" } })).toBe(1);
    await expect(requestRefund(s.token, [s.tickets[0]!.id], null)).rejects.toThrow("REFUND_TICKET_NOT_REFUNDABLE");
  });

  it("politique « sur demande » : en attente, puis acceptée par l'organisateur, une seule fois", async () => {
    const s = await setup({ policy: "ON_REQUEST" });
    const { refundId, automatic } = await requestRefund(s.token, [s.tickets[0]!.id, s.tickets[1]!.id], "Malade");
    expect(automatic).toBe(false);
    expect((await ticket(s.tickets[0]!.id)).status).toBe("VALID");
    await expect(requestRefund(s.token, [s.tickets[0]!.id], null)).rejects.toThrow("REFUND_ALREADY_PENDING");
    expect(await approveRefund(s.ctx, refundId, "Bon rétablissement")).toBe("SUCCEEDED");
    await expect(approveRefund(s.ctx, refundId, null)).rejects.toThrow("REFUND_NOT_PENDING");
    expect((await db.order.findUniqueOrThrow({ where: { id: s.orderId } })).status).toBe("REFUNDED");
  });

  it("non remboursable ; billet scanné : seul l'organisateur le rembourse (RG-REF-04)", async () => {
    const a = await setup({ policy: "NON_REFUNDABLE" });
    await expect(requestRefund(a.token, [a.tickets[0]!.id], null)).rejects.toThrow("REFUND_NOT_ALLOWED");
    const b = await setup({ policy: "ALWAYS" });
    await db.ticket.update({ where: { id: b.tickets[0]!.id }, data: { status: "CHECKED_IN", checkedInAt: new Date() } });
    await expect(requestRefund(b.token, [b.tickets[0]!.id], null)).rejects.toThrow("REFUND_TICKET_SCANNED");
    expect(await refundTickets(b.ctx, b.orderId, [b.tickets[0]!.id], "OTHER", "Geste commercial")).toBe("SUCCEEDED");
    expect((await ticket(b.tickets[0]!.id)).status).toBe("REFUNDED");
  });

  it("changement de date : fenêtre de 14 jours, acceptée d'office même si non remboursable (RG-EVT-05)", async () => {
    const s = await setup({ policy: "NON_REFUNDABLE" });
    await db.event.update({ where: { id: s.event.id }, data: { lastMajorChangeAt: new Date() } });
    expect(await requestRefund(s.token, [s.tickets[0]!.id], null)).toMatchObject({ automatic: true });
    expect((await db.refund.findFirstOrThrow({ where: { orderId: s.orderId } })).reason).toBe("EVENT_CHANGED");
  });

  it("remboursement payant sans Stripe : billets désactivés, échec signalé, relance possible (RG-REF-03)", async () => {
    const s = await setup({ policy: "ALWAYS", priceMinor: 2400 });
    expect(await refundTickets(s.ctx, s.orderId, [s.tickets[0]!.id], "OTHER", null)).toBe("FAILED");
    const refund = await db.refund.findFirstOrThrow({ where: { orderId: s.orderId } });
    expect(refund).toMatchObject({ status: "FAILED", amountMinor: 2400 });
    expect(refund.failureReason).toContain("Stripe");
    expect((await ticket(s.tickets[0]!.id)).status).toBe("REFUNDED");
    expect(await retryRefund(s.ctx, refund.id)).toBe("FAILED");
  });
});

describe("annulation d'un événement (RG-REF-07)", () => {
  it("double confirmation, billets annulés, réservations libérées, annonces retirées, acheteurs prévenus", async () => {
    const s = await setup({ policy: "NON_REFUNDABLE", quantity: 2 });
    await createListing(s.token, s.tickets[1]!.id, "0");
    const pending = await reserveOrder({ eventId: s.event.id, lines: [{ ticketTypeId: s.ticketType.id, quantity: 3 }], locale: "fr" });
    await expect(cancelEvent(s.ctx, s.event.id, "Intempéries", "mauvais titre")).rejects.toThrow("CANCEL_CONFIRMATION_MISMATCH");
    expect(await cancelEvent(s.ctx, s.event.id, "Intempéries", s.event.title)).toMatchObject({ orders: 1 });
    expect((await db.event.findUniqueOrThrow({ where: { id: s.event.id } })).status).toBe("CANCELLED");
    expect(await db.ticket.count({ where: { orderId: s.orderId, status: "VOID", voidReason: "EVENT_CANCELLED" } })).toBe(2);
    expect(await db.resaleListing.count({ where: { eventId: s.event.id, status: "CANCELLED" } })).toBe(1);
    expect((await db.order.findUniqueOrThrow({ where: { id: pending.orderId } })).status).toBe("CANCELLED");
    expect((await db.ticketType.findUniqueOrThrow({ where: { id: s.ticketType.id } })).quantityHeld).toBe(0);
    expect(await db.emailMessage.count({ where: { orderId: s.orderId, template: "refund.cancelled" } })).toBe(1);
  });
});

describe("commandes (US-ORD-01, RG-ORD-02)", () => {
  it("correction de l'e-mail : nouveau lien envoyé, l'ancien est invalidé", async () => {
    const s = await setup({ policy: "ALWAYS" });
    await correctBuyerEmail(s.ctx, s.orderId, `  Lea.Nouvelle.${s.id}@Exemple.be `);
    expect(await findOrderIdByToken(s.token)).toBeNull();
    expect(await findOrderIdByToken(orderAccessToken(s.orderId, 2))).toBe(s.orderId);
    const mail = await db.emailMessage.findFirstOrThrow({ where: { orderId: s.orderId, template: "order.confirmation" }, orderBy: { queuedAt: "desc" } });
    expect(mail.toEmail).toBe(`lea.nouvelle.${s.id}@exemple.be`);
  });

  it("recherche par code de billet, par nom complet, filtre des demandes en attente", async () => {
    const s = await setup({ policy: "ON_REQUEST" });
    expect((await searchOrders(s.ctx, { q: s.tickets[0]!.shortCode.toLowerCase() })).rows.map((r) => r.id)).toEqual([s.orderId]);
    expect((await searchOrders(s.ctx, { q: "Léa Martin" })).total).toBe(1);
    expect((await searchOrders(s.ctx, { filter: "REFUND_REQUESTED" })).total).toBe(0);
    await requestRefund(s.token, [s.tickets[0]!.id], null);
    const r = await searchOrders(s.ctx, { filter: "REFUND_REQUESTED" });
    expect(r).toMatchObject({ total: 1, pendingRequests: 1 });
  });
});
