import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  blockBuyer,
  blockPreview,
  isBlocked,
  listBlockedBuyers,
  unblockBuyer,
} from "@/server/blockedBuyers";
import {
  confirmOrderPayment,
  finalizeOrder,
  reserveOrder,
  submitBuyer,
} from "@/server/checkout";
import { findOrgContext, type OrgContext } from "@/server/context";
import { completeOrder } from "@/server/orders";
import { createListing, reserveResale } from "@/server/resale";
import { joinWaitlist } from "@/server/waitlist";

// personnes bloquées (lot « bloquer une personne ») : adresse et carte refusées avant le débit, nom en simple alerte,
// liste propre à chaque organisation, revente et liste d'attente comprises, déblocage
const fake = vi.hoisted(() => ({
  fingerprint: null as string | null,
  chargeFingerprint: null as string | null,
  confirmed: [] as string[],
  cancelled: [] as string[],
  refunds: [] as Array<Record<string, unknown>>,
}));
vi.mock("@/lib/stripe", () => ({
  stripe: () => ({
    paymentIntents: {
      create: async () => {
        const id = `pi_${Math.random().toString(36).slice(2, 12)}`;
        return {
          id,
          client_secret: `cs_${id}`,
          status: "requires_payment_method",
        };
      },
      retrieve: async (id: string) => ({
        id,
        client_secret: `cs_${id}`,
        status: "requires_payment_method",
      }),
      confirm: async (id: string) => {
        fake.confirmed.push(id);
        return { id, client_secret: `cs_${id}`, status: "succeeded" };
      },
      cancel: async (id: string) => {
        fake.cancelled.push(id);
        return { id, status: "canceled" };
      },
    },
    confirmationTokens: {
      retrieve: async (id: string) => ({
        id,
        payment_method_preview: fake.fingerprint
          ? { type: "card", card: { fingerprint: fake.fingerprint } }
          : { type: "bancontact" },
      }),
    },
    charges: {
      retrieve: async (id: string) => ({
        id,
        payment_method_details: fake.chargeFingerprint
          ? { type: "card", card: { fingerprint: fake.chargeFingerprint } }
          : { type: "bancontact" },
        balance_transaction: null,
      }),
    },
    refunds: {
      create: async (p: Record<string, unknown>) => {
        fake.refunds.push(p);
        return { id: `re_${fake.refunds.length}`, status: "succeeded" };
      },
    },
  }),
}));

const rid = () => Math.random().toString(36).slice(2, 10);
const ret = "https://club.evoly.me/mes-billets";
const buyer = (email: string, firstName = "Léa", lastName = "Martin") => ({
  firstName,
  lastName,
  email,
  marketingOptIn: false,
});

/** Une organisation (propriétaire connecté), un événement publié, un tarif ; payant avec un compte Stripe actif. */
async function setup(priceMinor = 0, quantity = 100) {
  const id = rid();
  const owner = await db.user.create({
    data: {
      name: "Camille",
      email: `own.${id}@exemple.be`,
      emailVerified: true,
    },
  });
  const org = await db.organization.create({
    data: {
      name: `Club ${id}`,
      slug: `club-${id}`,
      subdomain: `club-${id}`,
      country: "BE",
      currency: "EUR",
      timezone: "Europe/Brussels",
      locale: "fr",
    },
  });
  const role = await db.role.findFirstOrThrow({
    where: { systemKey: "OWNER" },
  });
  await db.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: owner.id,
      roleId: role.id,
      status: "ACTIVE",
    },
  });
  const ctx: OrgContext = {
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: "Camille", email: owner.email },
  };
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
      ticketTypes: {
        create: [
          {
            name: "Entrée",
            priceMinor,
            currency: "EUR",
            quantity,
            sortOrder: 0,
          },
        ],
      },
    },
    include: { ticketTypes: true },
  });
  return { id, org, ctx, event, ticketTypeId: event.ticketTypes[0]!.id };
}

const reserve = (eventId: string, ticketTypeId: string) =>
  reserveOrder({
    eventId,
    lines: [{ ticketTypeId, quantity: 1 }],
    locale: "fr",
  });

const held = async (ticketTypeId: string) =>
  (await db.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } }))
    .quantityHeld;

beforeEach(() => {
  fake.fingerprint = null;
  fake.chargeFingerprint = null;
  fake.confirmed = [];
  fake.cancelled = [];
  fake.refunds = [];
});

describe("adresse bloquée (RG-BLK-01, RG-BLK-04)", () => {
  it("bloquée malgré ses variantes (casse, points Gmail, suffixe « + ») : message neutre, réservation libérée", async () => {
    const s = await setup();
    await blockBuyer(s.ctx, {
      email: "Jean.Dupont@gmail.com",
      reason: "Revente sauvage",
    });
    for (const variant of [
      "jeandupont@gmail.com",
      "JEAN.DUPONT+promo@googlemail.com",
    ]) {
      const r = await reserve(s.event.id, s.ticketTypeId);
      await expect(submitBuyer(r.token, buyer(variant))).rejects.toMatchObject({
        code: "BUYER_BLOCKED",
      });
      expect(
        (await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).status,
      ).toBe("CANCELLED");
    }
    expect(await held(s.ticketTypeId)).toBe(0);
    // une autre adresse commande librement
    const ok = await reserve(s.event.id, s.ticketTypeId);
    expect(await submitBuyer(ok.token, buyer("lea@exemple.be"))).toEqual({
      kind: "PAID",
    });
  });

  it("organisation A sans effet sur l'organisation B : la liste n'est jamais partagée", async () => {
    const a = await setup();
    const b = await setup();
    await blockBuyer(a.ctx, { email: "nuisible@exemple.be" });
    expect(await isBlocked(a.org.id, { email: "Nuisible@exemple.be" })).toBe(
      true,
    );
    expect(await isBlocked(b.org.id, { email: "nuisible@exemple.be" })).toBe(
      false,
    );
    const r = await reserve(b.event.id, b.ticketTypeId);
    expect(await submitBuyer(r.token, buyer("nuisible@exemple.be"))).toEqual({
      kind: "PAID",
    });
    expect(await listBlockedBuyers(b.ctx)).toEqual([]);
  });
});

describe("carte bloquée (RG-BLK-02)", () => {
  it("refusée avant le débit, même avec une autre adresse : paiement annulé, places libérées", async () => {
    const s = await setup(1500);
    // première commande de la personne, payée avec sa carte
    fake.fingerprint = "fp_carte_mauvaise";
    const first = await reserve(s.event.id, s.ticketTypeId);
    await submitBuyer(first.token, buyer("mauvais@exemple.be", "Marc", "Noir"));
    expect(
      await confirmOrderPayment(first.token, "ctoken_premier1", ret),
    ).toEqual({ kind: "DONE" });
    const paid = await db.order.findUniqueOrThrow({
      where: { id: first.orderId },
    });
    expect(
      await finalizeOrder(paid.id, {
        paymentIntentId: paid.stripePaymentIntentId!,
        amountMinor: paid.totalMinor,
        currency: "EUR",
      }),
    ).toBe("PAID");
    // « Bloquer cet acheteur » depuis sa commande : adresse, nom et carte repris
    expect(await blockPreview(s.ctx, paid.id)).toMatchObject({
      email: "mauvais@exemple.be",
      firstName: "Marc",
      lastName: "Noir",
      cards: 1,
      alreadyBlocked: false,
    });
    expect(
      await blockBuyer(s.ctx, {
        email: "mauvais@exemple.be",
        firstName: "Marc",
        lastName: "Noir",
        orderId: paid.id,
      }),
    ).toMatchObject({ cards: 1 });
    expect((await blockPreview(s.ctx, paid.id)).alreadyBlocked).toBe(true);
    // nouvelle tentative, autre adresse et autre nom, même carte
    const again = await reserve(s.event.id, s.ticketTypeId);
    await submitBuyer(again.token, buyer("autre.adresse@exemple.be"));
    const intent = (
      await db.order.findUniqueOrThrow({ where: { id: again.orderId } })
    ).stripePaymentIntentId!;
    await expect(
      confirmOrderPayment(again.token, "ctoken_second22", ret),
    ).rejects.toMatchObject({ code: "BUYER_BLOCKED" });
    expect(fake.confirmed).toHaveLength(1); // rien n'a été débité la seconde fois
    expect(fake.cancelled).toContain(intent);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: again.orderId } }))
        .status,
    ).toBe("CANCELLED");
    expect(await held(s.ticketTypeId)).toBe(0);
  });

  it("filet de sécurité : un paiement confirmé sans la vérification est remboursé en entier, aucun billet émis", async () => {
    const s = await setup(1500);
    await db.blockedBuyer.create({
      data: {
        organizationId: s.org.id,
        email: "vol@exemple.be",
        emailKey: "vol@exemple.be",
        cards: {
          create: { organizationId: s.org.id, fingerprint: "fp_carte_volee" },
        },
      },
    });
    const r = await reserve(s.event.id, s.ticketTypeId);
    await submitBuyer(r.token, buyer("propre@exemple.be"));
    const order = await db.order.findUniqueOrThrow({
      where: { id: r.orderId },
    });
    fake.chargeFingerprint = "fp_carte_volee";
    expect(
      await completeOrder(order.id, {
        paymentIntentId: order.stripePaymentIntentId!,
        amountMinor: order.totalMinor,
        currency: "eur",
        chargeId: `ch_${s.id}`,
        paymentMethodType: "card",
      }),
    ).toBe("IGNORED");
    expect(fake.refunds).toEqual([
      expect.objectContaining({
        payment_intent: order.stripePaymentIntentId,
        refund_application_fee: true,
      }),
    ]);
    expect(
      await db.order.findUniqueOrThrow({ where: { id: order.id } }),
    ).toMatchObject({
      status: "REFUNDED",
      refundedMinor: order.totalMinor,
      cardFingerprint: "fp_carte_volee",
    });
    expect(await db.ticket.count({ where: { orderId: order.id } })).toBe(0);
    expect(await held(s.ticketTypeId)).toBe(0);
    // carte propre : la commande est validée normalement
    const ok = await reserve(s.event.id, s.ticketTypeId);
    await submitBuyer(ok.token, buyer("propre@exemple.be"));
    const okOrder = await db.order.findUniqueOrThrow({
      where: { id: ok.orderId },
    });
    fake.chargeFingerprint = "fp_carte_propre";
    expect(
      await completeOrder(okOrder.id, {
        paymentIntentId: okOrder.stripePaymentIntentId!,
        amountMinor: okOrder.totalMinor,
        currency: "eur",
        chargeId: `ch_ok_${s.id}`,
        paymentMethodType: "card",
      }),
    ).toBe("PAID");
  });
});

describe("nom et prénom : simple alerte (RG-BLK-03)", () => {
  it("la commande passe, porte la pastille « Signalé » et l'organisation est prévenue", async () => {
    const s = await setup();
    await expect(
      blockBuyer(s.ctx, { firstName: "Jean" }),
    ).rejects.toMatchObject({ code: "BLOCK_NEEDS_EMAIL_OR_NAME" });
    const entry = await blockBuyer(s.ctx, {
      firstName: "Jean",
      lastName: "Dupont",
    });
    const r = await reserve(s.event.id, s.ticketTypeId);
    expect(
      await submitBuyer(
        r.token,
        buyer("homonyme@exemple.be", " JÉAN ", "dupont"),
      ),
    ).toEqual({ kind: "PAID" });
    const order = await db.order.findUniqueOrThrow({
      where: { id: r.orderId },
    });
    expect(order.status).toBe("PAID");
    expect(order.flaggedAt).not.toBeNull();
    expect(order.flaggedBlockedBuyerId).toBe(entry.id);
    const notes = await db.notification.findMany({
      where: { organizationId: s.org.id, type: "BUYER_FLAGGED" },
    });
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0]!.link).toBe(`/orders/${order.id}`);
  });
});

describe("revente et liste d'attente (RG-BLK-05)", () => {
  it("achat d'une place en revente refusé : l'annonce est remise en vente", async () => {
    const s = await setup();
    const seller = await reserve(s.event.id, s.ticketTypeId);
    await submitBuyer(seller.token, buyer("vendeur@exemple.be"));
    const ticket = await db.ticket.findFirstOrThrow({
      where: { orderId: seller.orderId },
    });
    const listing = await createListing(seller.token, ticket.id, "0");
    await blockBuyer(s.ctx, { email: "bloque@exemple.be" });
    const r = await reserveResale(listing.linkCode, "fr");
    await expect(
      submitBuyer(r.token, buyer("Bloque@exemple.be")),
    ).rejects.toMatchObject({ code: "BUYER_BLOCKED" });
    expect(
      await db.resaleListing.findUniqueOrThrow({ where: { id: listing.id } }),
    ).toMatchObject({ status: "ACTIVE" });
  });

  it("inscription à la liste d'attente refusée", async () => {
    const s = await setup(0, 1);
    await db.ticketType.update({
      where: { id: s.ticketTypeId },
      data: { quantitySold: 1 }, // complet
    });
    await blockBuyer(s.ctx, { email: "bloque@gmail.com" });
    await expect(
      joinWaitlist(
        s.event.id,
        s.ticketTypeId,
        "b.l.o.q.u.e@gmail.com",
        1,
        "fr",
      ),
    ).rejects.toMatchObject({ code: "WAITLIST_BLOCKED" });
    await expect(
      joinWaitlist(s.event.id, s.ticketTypeId, "libre@exemple.be", 1, "fr"),
    ).resolves.toBeTruthy();
  });
});

describe("liste et déblocage", () => {
  it("une adresse déjà bloquée complète sa fiche ; débloquer rend l'achat possible, sans données personnelles au journal", async () => {
    const s = await setup();
    const first = await blockBuyer(s.ctx, {
      email: "paul@gmail.com",
      reason: "Insultes",
    });
    const second = await blockBuyer(s.ctx, {
      email: "P.aul+bis@googlemail.com",
      firstName: "Paul",
      lastName: "Durand",
    });
    expect(second.id).toBe(first.id);
    const rows = await listBlockedBuyers(s.ctx);
    expect(rows).toEqual([
      expect.objectContaining({
        id: first.id,
        name: "Paul Durand",
        email: "paul@gmail.com",
        hasCard: false,
        reason: "Insultes",
        addedBy: "Camille",
      }),
    ]);
    // une commande signalée garde sa pastille après le déblocage
    const flagged = await reserve(s.event.id, s.ticketTypeId);
    await submitBuyer(
      flagged.token,
      buyer("autre@exemple.be", "Paul", "Durand"),
    );
    await unblockBuyer(s.ctx, first.id);
    await expect(unblockBuyer(s.ctx, first.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await listBlockedBuyers(s.ctx)).toEqual([]);
    expect(
      await db.order.findUniqueOrThrow({ where: { id: flagged.orderId } }),
    ).toMatchObject({
      flaggedAt: expect.any(Date),
      flaggedBlockedBuyerId: null,
    });
    const r = await reserve(s.event.id, s.ticketTypeId);
    expect(await submitBuyer(r.token, buyer("paul@gmail.com"))).toEqual({
      kind: "PAID",
    });
    const log = await db.auditLog.findMany({
      where: { organizationId: s.org.id, targetType: "BlockedBuyer" },
      orderBy: { createdAt: "asc" },
    });
    expect(log.map((l) => l.action)).toEqual([
      "buyer.blocked",
      "buyer.block_updated",
      "buyer.unblocked",
    ]);
    expect(JSON.stringify(log.map((l) => l.metadata))).not.toMatch(
      /paul|Insultes|Durand/i,
    );
  });

  it("une autre organisation ne peut pas débloquer ni lire la fiche", async () => {
    const a = await setup();
    const b = await setup();
    const entry = await blockBuyer(a.ctx, { email: "x@exemple.be" });
    await expect(unblockBuyer(b.ctx, entry.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await listBlockedBuyers(a.ctx)).toHaveLength(1);
  });
});
