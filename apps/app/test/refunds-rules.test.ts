import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import { approveRefund, cancelEvent, refundTickets, rejectRefund, requestRefund, retryRefund } from "@/server/refunds";

// remboursements (US-REF-01 à 03, RG-REF-03 et 04) : demande de l'acheteur, décisions de l'organisateur, annulation
const rid = () => Math.random().toString(36).slice(2, 10);
async function setup(refundPolicy: "NON_REFUNDABLE" | "ON_REQUEST" = "ON_REQUEST") {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
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
      visibility: "PUBLIC",
      refundPolicy,
      ticketTypes: { create: [{ name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 100, sortOrder: 0 }] },
    },
    include: { ticketTypes: true },
  });
  const buy = async () => {
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 2 }], locale: "fr" });
    await submitBuyer(r.token, { firstName: "Léa", lastName: "Martin", email: `lea.${rid()}@exemple.be`, marketingOptIn: false });
    const order = await db.order.findFirstOrThrow({ where: { eventId: event.id }, orderBy: { createdAt: "desc" } });
    const tickets = await db.ticket.findMany({ where: { orderId: order.id }, orderBy: { id: "asc" } });
    return { token: r.token, order, tickets };
  };
  return { ctx, event, buy };
}
const refused = (code: string) => expect.objectContaining({ code });

describe("remboursements : demande de l'acheteur", () => {
  it("lien inconnu ou événement non remboursable refusés ; demande en attente ; même billet deux fois, scanné ou d'une autre commande refusé", async () => {
    await expect(requestRefund("jeton-inconnu", ["t"], null)).rejects.toEqual(refused("ORDER_NOT_FOUND"));
    const strict = await setup("NON_REFUNDABLE");
    const s = await strict.buy();
    await expect(requestRefund(s.token, [s.tickets[0]!.id], null)).rejects.toEqual(refused("REFUND_NOT_ALLOWED"));
    const { buy } = await setup();
    const a = await buy();
    const b = await buy();
    await expect(requestRefund(a.token, [], null)).rejects.toEqual(refused("NOT_FOUND"));
    await expect(requestRefund(a.token, [b.tickets[0]!.id], null)).rejects.toEqual(refused("NOT_FOUND"));
    await requestRefund(a.token, [a.tickets[0]!.id], "Je ne pourrai pas venir.");
    expect(await db.refund.findFirstOrThrow({ where: { orderId: a.order.id } })).toMatchObject({ status: "REQUESTED" });
    await expect(requestRefund(a.token, [a.tickets[0]!.id], null)).rejects.toEqual(refused("REFUND_ALREADY_PENDING"));
    await db.ticket.update({ where: { id: a.tickets[1]!.id }, data: { status: "CHECKED_IN" } });
    await expect(requestRefund(a.token, [a.tickets[1]!.id], null)).rejects.toEqual(refused("REFUND_TICKET_SCANNED"));
  });
});

describe("remboursements : décisions de l'organisateur", () => {
  it("refus avec message ; seulement sur une demande en attente ; autre organisateur : introuvable ; relance d'un remboursement non échoué refusée", async () => {
    const { ctx, buy } = await setup();
    const a = await buy();
    await requestRefund(a.token, [a.tickets[0]!.id], null);
    const refund = await db.refund.findFirstOrThrow({ where: { orderId: a.order.id } });
    const other = await setup();
    await expect(rejectRefund(other.ctx, refund.id, null)).rejects.toEqual(refused("NOT_FOUND"));
    await rejectRefund(ctx, refund.id, "  Demande hors délai  ");
    expect(await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).toMatchObject({ status: "REJECTED", responseMessage: "Demande hors délai" });
    await expect(rejectRefund(ctx, refund.id, null)).rejects.toEqual(refused("REFUND_NOT_PENDING"));
    await expect(approveRefund(ctx, refund.id, null)).rejects.toEqual(refused("REFUND_NOT_PENDING"));
    await expect(retryRefund(ctx, refund.id)).rejects.toEqual(refused("REFUND_NOT_FAILED"));
  });

  it("remboursement d'une commande inconnue refusé ; annulation : le titre doit être recopié exactement", async () => {
    const { ctx, event } = await setup();
    await expect(refundTickets(ctx, "commande-inconnue", ["t"], "ORGANIZER" as never, null)).rejects.toEqual(refused("REFUND_NOT_ALLOWED"));
    await expect(cancelEvent(ctx, event.id, "Salle indisponible", "Gala")).rejects.toEqual(refused("CANCEL_CONFIRMATION_MISMATCH"));
    expect((await db.event.findUniqueOrThrow({ where: { id: event.id } })).status).toBe("PUBLISHED");
  });
});
