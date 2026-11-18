import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  blockBuyer,
  blockPreview,
  isBlocked,
  listBlockedBuyers,
  unblockBuyer,
} from "@/server/blockedBuyers";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import { findOrgContext, type OrgContext } from "@/server/context";
import { saveMollieAuthorization } from "@/server/mollieAccounts";
import { syncPaymentFromMollie } from "@/server/molliePayments";
import { createListing, reserveResale } from "@/server/resale";
import { joinWaitlist } from "@/server/waitlist";

// personnes bloquées (lot « bloquer une personne ») : adresse refusée avant le paiement, carte reconnue au paiement et
// remboursée, nom en simple alerte, liste propre à chaque organisation, revente et liste d'attente comprises, déblocage

const rid = () => Math.random().toString(36).slice(2, 10);

/**
 * Mollie simulé : chaque paiement créé est payé avec la carte choisie par le test (empreinte rendue par Mollie quand le
 * paiement est relu) ; chaque remboursement demandé est capturé.
 */
const fake = {
  card: null as string | null,
  payments: new Map<string, unknown>(),
  refunds: [] as Array<Record<string, unknown>>,
};
beforeEach(() => {
  fake.card = null;
  fake.payments.clear();
  fake.refunds = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL, init: RequestInit = {}) => {
      const { pathname } = new URL(String(input));
      const sent =
        typeof init.body === "string"
          ? (JSON.parse(init.body) as Record<string, unknown>)
          : {};
      const reply = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status });
      if (init.method === "POST" && pathname === "/v2/payments") {
        const id = `tr_${rid()}`;
        fake.payments.set(id, sent.amount);
        return reply(
          {
            id,
            status: "open",
            amount: sent.amount,
            _links: {
              checkout: { href: `https://www.mollie.com/checkout/${id}` },
            },
          },
          201,
        );
      }
      const refund = /^\/v2\/payments\/(\w+)\/refunds$/.exec(pathname);
      if (init.method === "POST" && refund) {
        fake.refunds.push({ paymentId: refund[1], ...sent });
        return reply(
          { id: `re_${rid()}`, status: "pending", amount: sent.amount },
          201,
        );
      }
      const payment = /^\/v2\/payments\/(\w+)$/.exec(pathname);
      if (payment && fake.payments.has(payment[1]!))
        return reply({
          id: payment[1],
          status: "paid",
          amount: fake.payments.get(payment[1]!),
          method: "creditcard",
          details: fake.card ? { cardFingerprint: fake.card } : null,
          _links: {},
        });
      return reply({ status: 404, title: "Not Found", detail: pathname }, 404);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const ret = "https://club.evoly.me/mes-billets";
const buyer = (email: string, firstName = "Léa", lastName = "Martin") => ({
  firstName,
  lastName,
  email,
  marketingOptIn: false,
});

/** Une organisation (propriétaire connecté), un événement publié, un tarif ; payant avec un compte Mollie prêt. */
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
  if (priceMinor > 0) {
    const account = await saveMollieAuthorization({
      organizationId: org.id,
      mollieOrganizationId: `org_${id}`,
      tokens: {
        access_token: "access_mollie",
        refresh_token: "refresh_mollie",
        expires_in: 3600,
        token_type: "bearer",
        scope: "payments.read payments.write refunds.read refunds.write",
      },
      testmode: false,
    });
    await db.mollieAccount.update({
      where: { id: account.id },
      data: {
        profileId: `pfl_${id}`,
        profileStatus: "verified",
        methods: ["bancontact", "creditcard"],
        onboardingStatus: "COMPLETED",
        canReceivePayments: true,
      },
    });
  }
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

/** Commande payante : coordonnées, puis départ vers la page de paiement de Mollie. */
const startPayment = async (token: string, who: ReturnType<typeof buyer>) => {
  expect(
    await submitBuyer(token, who, undefined, { returnUrl: ret }),
  ).toMatchObject({ kind: "REDIRECT" });
};

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
  it("carte reprise de sa commande ; reconnue au paiement suivant, même avec une autre adresse : remboursée en entier chez Mollie, places libérées, aucun billet ; une autre carte passe", async () => {
    const s = await setup(1500);
    // première commande de la personne, payée avec sa carte (empreinte donnée par Mollie au paiement)
    const first = await reserve(s.event.id, s.ticketTypeId);
    await startPayment(
      first.token,
      buyer("mauvais@exemple.be", "Marc", "Noir"),
    );
    fake.card = "fp_carte_mauvaise";
    expect(await syncPaymentFromMollie(first.orderId)).toBe("paid");
    const paid = await db.order.findUniqueOrThrow({
      where: { id: first.orderId },
    });
    expect(paid).toMatchObject({
      status: "PAID",
      cardFingerprint: "fp_carte_mauvaise",
    });
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
    // nouvelle tentative, autre adresse et autre nom, même carte : l'empreinte n'est connue qu'après le paiement
    const again = await reserve(s.event.id, s.ticketTypeId);
    await startPayment(again.token, buyer("autre.adresse@exemple.be"));
    await syncPaymentFromMollie(again.orderId);
    const refused = await db.order.findUniqueOrThrow({
      where: { id: again.orderId },
    });
    expect(fake.refunds).toEqual([
      expect.objectContaining({
        paymentId: refused.molliePaymentId,
        amount: { currency: "EUR", value: "15.00" },
        metadata: { orderId: again.orderId, cause: "blocked" },
      }),
    ]);
    expect(refused).toMatchObject({
      status: "REFUNDED",
      refundedMinor: 1500,
      cardFingerprint: "fp_carte_mauvaise",
    });
    expect(await db.ticket.count({ where: { orderId: again.orderId } })).toBe(
      0,
    );
    expect(await held(s.ticketTypeId)).toBe(0);
    // une autre carte : la commande est validée normalement
    const ok = await reserve(s.event.id, s.ticketTypeId);
    await startPayment(ok.token, buyer("autre.adresse@exemple.be"));
    fake.card = "fp_carte_propre";
    await syncPaymentFromMollie(ok.orderId);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: ok.orderId } })).status,
    ).toBe("PAID");
    expect(fake.refunds).toHaveLength(1);
    expect(
      await db.ticketType.findUniqueOrThrow({ where: { id: s.ticketTypeId } }),
    ).toMatchObject({ quantitySold: 2, quantityHeld: 0 });
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
