import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import { syncPaymentFromStripe } from "@/server/orders";
import { refundTickets } from "@/server/refunds";

// paiements réels en mode test de Stripe, par l'API (méthode recommandée par Stripe pour les tests automatisés,
// sans ses protections anti-robots) : actifs seulement avec une clé secrète DE TEST et un compte connecté de test
const key = process.env.STRIPE_SECRET_KEY ?? "";
const account = process.env.E2E_STRIPE_ACCOUNT ?? "";
const enabled = key.startsWith("sk_test_") && account.startsWith("acct_");
const suite = enabled ? describe : describe.skip;
const rid = () => Math.random().toString(36).slice(2, 10);

/** Organisateur rattaché au compte connecté de test, événement publié à 12 €, réservation payante d'un billet. */
async function paidReservation() {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  await db.stripeAccount.deleteMany({ where: { stripeAccountId: account } }); // un seul compte de test, rattaché tour à tour
  await db.stripeAccount.create({
    data: {
      organizationId: org.id,
      stripeAccountId: account,
      country: "BE",
      defaultCurrency: "EUR",
      status: "ACTIVE",
      chargesEnabled: true,
      payoutsEnabled: true,
      detailsSubmitted: true,
    },
  });
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
      refundPolicy: "ON_REQUEST",
      ticketTypes: { create: [{ name: "Entrée", priceMinor: 1200, currency: "EUR", quantity: 100, sortOrder: 0 }] },
    },
    include: { ticketTypes: true },
  });
  const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" });
  const result = await submitBuyer(r.token, { firstName: "Léa", lastName: "Martin", email: `lea.${id}@exemple.be`, marketingOptIn: false });
  const order = await db.order.findFirstOrThrow({ where: { eventId: event.id } });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  return { ctx, order, result };
}
/** Confirmation par Stripe avec un moyen de paiement de test (pm_card_…), comme le ferait le navigateur de l'acheteur. */
const confirm = (intentId: string, paymentMethod: string) =>
  stripe()!.paymentIntents.confirm(intentId, { payment_method: paymentMethod, return_url: "https://evoly.me/retour" }, { stripeAccount: account });
const tickets = (orderId: string) => db.ticket.count({ where: { orderId } });

suite("paiements réels en mode test de Stripe", () => {
  it(
    "carte acceptée : paiement créé sur le compte de l'organisateur (montant, commission), payée au retour, billet émis ; remboursement réel",
    { timeout: 90_000 },
    async () => {
      const { ctx, order, result } = await paidReservation();
      expect(result).toMatchObject({ kind: "PAYMENT", stripeAccountId: account });
      const intent = await stripe()!.paymentIntents.retrieve(order.stripePaymentIntentId!, {}, { stripeAccount: account });
      expect([intent.amount, intent.currency, intent.application_fee_amount]).toEqual([order.totalMinor, "eur", order.applicationFeeMinor]);
      expect((await confirm(intent.id, "pm_card_visa")).status).toBe("succeeded");
      await syncPaymentFromStripe(order.id); // retour de l'acheteur : sans attendre la notification de Stripe (RG-BUY-08)
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PAID");
      expect(await tickets(order.id)).toBe(1);
      const ticket = await db.ticket.findFirstOrThrow({ where: { orderId: order.id } });
      await refundTickets(ctx, order.id, [ticket.id], "OTHER", null);
      const refund = await db.refund.findFirstOrThrow({ where: { orderId: order.id }, orderBy: { createdAt: "desc" } });
      expect(["PROCESSING", "SUCCEEDED"]).toContain(refund.status);
    },
  );

  it("carte refusée : Stripe refuse, commande laissée en attente, aucun billet", { timeout: 60_000 }, async () => {
    const { order } = await paidReservation();
    await expect(confirm(order.stripePaymentIntentId!, "pm_card_chargeDeclined")).rejects.toMatchObject({ code: "card_declined" });
    await syncPaymentFromStripe(order.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
    expect(await tickets(order.id)).toBe(0);
  });

  it("3-D Secure exigé : paiement en attente d'authentification, commande non validée", { timeout: 60_000 }, async () => {
    const { order } = await paidReservation();
    expect((await confirm(order.stripePaymentIntentId!, "pm_card_authenticationRequired")).status).toBe("requires_action");
    await syncPaymentFromStripe(order.id);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
    expect(await tickets(order.id)).toBe(0);
  });
});
