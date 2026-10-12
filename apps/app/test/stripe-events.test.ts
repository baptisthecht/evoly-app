import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder } from "@/server/checkout";
import { handleConnectEvent } from "@/server/stripeConnectEvents";

const DAY = 86_400_000;
const rid = () => Math.random().toString(36).slice(2, 10);
const ev = (type: string, object: Record<string, unknown>, account?: string) => ({ id: `evt_${rid()}`, type, account, data: { object } }) as never;

async function setup() {
  const id = rid();
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const acct = `acct_${id}`;
  await db.stripeAccount.create({
    data: {
      organizationId: org.id,
      stripeAccountId: acct,
      country: "BE",
      defaultCurrency: "EUR",
      status: "ACTIVE",
      chargesEnabled: true,
      payoutsEnabled: true,
    },
  });
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
      ticketTypes: { create: { name: "Entrée", priceMinor: 1000, currency: "EUR", quantity: 50 } },
    },
    include: { ticketTypes: true },
  });
  const commande = async () => {
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" });
    await db.order.update({ where: { id: r.orderId }, data: { buyerEmail: `client.${rid()}@exemple.be`, buyerFirstName: "Alex", buyerLastName: "Martin" } });
    return db.order.findUniqueOrThrow({ where: { id: r.orderId } });
  };
  return { org, acct, commande };
}

describe("notifications de Stripe (Connect)", () => {
  it("compte inconnu ou absent ignoré ; déconnexion d'un organisateur : compte désactivé et tracé", async () => {
    const s = await setup();
    expect(await handleConnectEvent(ev("account.updated", { id: "acct_inconnu" }))).toBe("IGNORED");
    expect(await handleConnectEvent(ev("account.application.deauthorized", {}))).toBe("IGNORED");
    expect(await handleConnectEvent(ev("account.application.deauthorized", {}, "acct_inconnu"))).toBe("IGNORED");
    expect(await handleConnectEvent(ev("account.application.deauthorized", {}, s.acct))).toBe("PROCESSED");
    expect(await db.stripeAccount.findUniqueOrThrow({ where: { stripeAccountId: s.acct } })).toMatchObject({
      status: "DISABLED",
      chargesEnabled: false,
      payoutsEnabled: false,
    });
    expect(await db.auditLog.count({ where: { organizationId: s.org.id, action: "stripe.account_deauthorized" } })).toBe(1);
  });

  it("paiement réussi : commande validée une seule fois (RG-BUY-07) ; sans commande : ignoré", async () => {
    const s = await setup();
    const o = await s.commande();
    const pi = {
      id: `pi_${rid()}`,
      metadata: { orderId: o.id },
      amount_received: o.totalMinor,
      currency: "eur",
      latest_charge: `ch_${rid()}`,
      payment_method_types: ["card"],
    };
    expect(await handleConnectEvent(ev("payment_intent.succeeded", { ...pi, metadata: {} }))).toBe("IGNORED");
    expect(await handleConnectEvent(ev("payment_intent.succeeded", pi, s.acct))).toBe("PROCESSED");
    expect(await handleConnectEvent(ev("payment_intent.succeeded", pi, s.acct))).toBe("PROCESSED"); // la même notification reçue deux fois
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ status: "PAID", stripePaymentIntentId: pi.id });
    expect(await db.ticket.count({ where: { orderId: o.id } })).toBe(1);
  });

  it("paiement échoué : réservation gardée (RG-BUY-06) ; paiement annulé : réservation libérée aussitôt", async () => {
    const s = await setup();
    const o = await s.commande();
    expect(await handleConnectEvent(ev("payment_intent.payment_failed", { id: "pi_x", metadata: { orderId: o.id } }))).toBe("PROCESSED");
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).holdExpiresAt!.getTime()).toBeGreaterThan(Date.now());
    expect(await handleConnectEvent(ev("payment_intent.canceled", { id: "pi_x", metadata: {} }))).toBe("IGNORED");
    expect(await handleConnectEvent(ev("payment_intent.canceled", { id: "pi_x", metadata: { orderId: o.id } }))).toBe("PROCESSED");
    expect((await db.order.findUniqueOrThrow({ where: { id: o.id } })).holdExpiresAt!.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("frais, remboursement inconnu, litige, virements, type inconnu", async () => {
    const s = await setup();
    expect(await handleConnectEvent(ev("charge.updated", { id: "ch_x", balance_transaction: null }))).toBe("IGNORED");
    expect(await handleConnectEvent(ev("refund.updated", { id: "re_inconnu", status: "succeeded" }))).toBe("IGNORED");
    const dispute = {
      id: `dp_${rid()}`,
      charge: "ch_inconnu",
      amount: 1000,
      currency: "eur",
      reason: "fraudulent",
      status: "needs_response",
      evidence_details: { due_by: Math.floor(Date.now() / 1000) + 7 * 86_400 },
    };
    expect(await handleConnectEvent(ev("charge.dispute.created", dispute))).toBe("IGNORED"); // sans compte connecté
    expect(await handleConnectEvent(ev("charge.dispute.created", dispute, s.acct))).toBe("PROCESSED");
    expect(await handleConnectEvent(ev("payout.paid", { id: "po_x" }, s.acct))).toBe("PROCESSED");
    expect(await handleConnectEvent(ev("payout.failed", { id: "po_x", amount: 12_345, currency: "eur", failure_message: "compte clôturé" }))).toBe("IGNORED");
    expect(await handleConnectEvent(ev("payout.failed", { id: "po_x", amount: 12_345, currency: "eur", failure_message: "compte clôturé" }, s.acct))).toBe(
      "PROCESSED",
    );
    expect(await handleConnectEvent(ev("customer.created", {}))).toBe("IGNORED");
  });
});
