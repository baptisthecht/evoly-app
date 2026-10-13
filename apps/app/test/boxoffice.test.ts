import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { cashReport, qrSaleStatus, sellCash, startQrSale } from "@/server/boxOffice";
import { finalizeOrder, reservationByToken } from "@/server/checkout";
import { refundTickets } from "@/server/refunds";
import { findOrgContext } from "@/server/context";

const DAY = 86_400_000;
const rid = () => Math.random().toString(36).slice(2, 10);

async function setup() {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `soiree-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Soirée ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 20 * DAY),
      status: "PUBLISHED",
      ticketTypes: { create: { name: "Entrée", priceMinor: 1000, currency: "EUR", quantity: 5 } },
    },
    include: { ticketTypes: true },
  });
  const lien = (data: { canSell?: boolean; checkOnly?: boolean; label?: string }) =>
    db.scannerLink.create({
      data: {
        eventId: event.id,
        tokenHash: `h-${rid()}`,
        label: data.label ?? "Entrée principale",
        expiresAt: new Date(Date.now() + 30 * DAY),
        createdById: owner.id,
        canSell: !!data.canSell,
        checkOnly: !!data.checkOnly,
      },
    });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  return { event, type: event.ticketTypes[0]!, lien, ctx };
}

describe("vente sur place en espèces (section 9.27)", () => {
  it("vente enregistrée sans commission, billets entrés, stock partagé, e-mail facultatif, droits du lien, rapport de caisse (RG-POS-01, RG-POS-02, RG-POS-03, RG-POS-04, RG-POS-05, RG-POS-07)", async () => {
    const s = await setup();
    const caisse = await s.lien({ canSell: true, label: "Caisse 1" });
    const r = await sellCash(caisse, { lines: [{ ticketTypeId: s.type.id, quantity: 2 }], deviceId: "tel-1" });
    expect(r.tickets).toBe(2);
    const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { tickets: true } });
    expect(order).toMatchObject({
      status: "PAID",
      source: "BOX_OFFICE",
      boxOfficeMode: "CASH",
      applicationFeeMinor: 0,
      soldByLinkId: caisse.id,
      totalMinor: 2000,
    });
    expect(order.tickets.every((t) => t.status === "CHECKED_IN")).toBe(true);
    expect(await db.checkIn.count({ where: { scannerLinkId: caisse.id, result: "VALID" } })).toBe(2);
    expect((await db.ticketType.findUniqueOrThrow({ where: { id: s.type.id } })).quantitySold).toBe(2);
    // avec un e-mail : le client reçoit ses billets
    const email = `client.${rid()}@exemple.be`;
    await sellCash(caisse, { lines: [{ ticketTypeId: s.type.id, quantity: 1 }], email });
    expect(await db.emailMessage.count({ where: { toEmail: email } })).toBeGreaterThanOrEqual(1);
    // droits du lien : pas de vente sans autorisation, ni avec un lien de vérification seule
    await expect(sellCash(await s.lien({}), { lines: [{ ticketTypeId: s.type.id, quantity: 1 }] })).rejects.toMatchObject({ code: "BOX_OFFICE_FORBIDDEN" });
    await expect(
      sellCash({ ...(await s.lien({ canSell: true })), checkOnly: true }, { lines: [{ ticketTypeId: s.type.id, quantity: 1 }] }),
    ).rejects.toMatchObject({ code: "BOX_OFFICE_FORBIDDEN" });
    // même stock que la vente en ligne : 2 places restent, pas une de plus
    await sellCash(caisse, { lines: [{ ticketTypeId: s.type.id, quantity: 2 }] });
    await expect(sellCash(caisse, { lines: [{ ticketTypeId: s.type.id, quantity: 1 }] })).rejects.toThrow();
    expect(await cashReport(s.ctx, s.event.id)).toEqual([{ label: "Caisse 1", mode: "CASH", sales: 3, amountMinor: 5000 }]);
  });

  it("paiement par QR code : places réservées, page de paiement par le jeton, suivi réservé au lien, billets entrés une fois payé (RG-POS-03, RG-POS-04)", async () => {
    const s = await setup();
    const caisse = await s.lien({ canSell: true, label: "Caisse QR" });
    const q = await startQrSale(caisse, { lines: [{ ticketTypeId: s.type.id, quantity: 1 }] });
    expect(q.url).toContain("/payer/");
    expect(q.qrSvg.startsWith("<svg")).toBe(true);
    const order = await db.order.findUniqueOrThrow({ where: { id: q.orderId } });
    expect(order).toMatchObject({ status: "PENDING", source: "BOX_OFFICE", boxOfficeMode: "QR", soldByLinkId: caisse.id, applicationFeeMinor: 49 }); // commission habituelle
    const r = await reservationByToken(q.url.split("/payer/")[1]!);
    expect(r).toMatchObject({ orderId: q.orderId, totalMinor: 1000, lines: [expect.objectContaining({ name: "Entrée", quantity: 1 })] });
    expect(await qrSaleStatus(caisse, q.orderId)).toEqual({ status: "PENDING" });
    await expect(qrSaleStatus(await s.lien({ canSell: true }), q.orderId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db.order.update({ where: { id: q.orderId }, data: { buyerEmail: `client.${rid()}@exemple.be`, buyerFirstName: "Alex", buyerLastName: "Martin" } });
    expect(await finalizeOrder(q.orderId)).toBe("PAID"); // comme après la confirmation du paiement par Stripe
    expect(await qrSaleStatus(caisse, q.orderId)).toEqual({ status: "PAID", tickets: 1 });
    expect(await qrSaleStatus(caisse, q.orderId)).toEqual({ status: "PAID", tickets: 1 });
    expect((await db.ticket.findFirstOrThrow({ where: { orderId: q.orderId } })).status).toBe("CHECKED_IN");
  });

  it("remboursement d'une vente en espèces depuis le tableau de bord, sans Stripe (RG-POS-08)", async () => {
    const s = await setup();
    const caisse = await s.lien({ canSell: true });
    const v = await sellCash(caisse, { lines: [{ ticketTypeId: s.type.id, quantity: 1 }] });
    const ticket = await db.ticket.findFirstOrThrow({ where: { orderId: v.orderId } });
    await refundTickets(s.ctx, v.orderId, [ticket.id], "OTHER", null);
    const refund = await db.refund.findFirstOrThrow({ where: { orderId: v.orderId } });
    expect(refund.status).toBe("SUCCEEDED");
    expect((await db.order.findUniqueOrThrow({ where: { id: v.orderId } })).status).toBe("REFUNDED");
  });
});
