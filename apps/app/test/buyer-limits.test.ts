import { buyerEmailKey } from "@evoly/core";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { checkBuyerLimits } from "@/server/buyerLimits";
import { findOrgContext } from "@/server/context";
import { createEvent } from "@/server/events";

// limites d'achat par acheteur (adresse normalisée) : événement, tarif, prévente, code promo qui les relève
const rid = () => Math.random().toString(36).slice(2, 10);
async function setup() {
  const id = rid();
  const owner = await db.user.create({
    data: {
      name: "Camille",
      email: `own.${id}@exemple.fr`,
      emailVerified: true,
    },
  });
  const org = await db.organization.create({
    data: {
      name: `Salle ${id}`,
      slug: `salle-${id}`,
      subdomain: `salle-${id}`,
      country: "FR",
      currency: "EUR",
      timezone: "Europe/Paris",
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
  const ctx = {
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: "Camille", email: owner.email },
  };
  const event = await createEvent(
    ctx,
    {
      title: "Concert",
      startsAtLocal: "2027-05-20T20:00",
      endsAtLocal: "2027-05-20T23:00",
      timezone: "Europe/Paris",
      locationType: "PHYSICAL",
      locationName: "Salle",
      city: "Paris",
      country: "FR",
    },
    { name: "Fosse", price: "20", quantity: 500 },
  );
  const fosse = await db.ticketType.findFirstOrThrow({
    where: { eventId: event.id },
  });
  const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = fosse;
  const balcon = await db.ticketType.create({
    data: {
      ...rest,
      name: "Balcon",
      quantitySold: 0,
      quantityHeld: 0,
      quantityAllocated: 0,
    },
  });
  /** Commande de l'acheteur : payée (avec ses billets), en cours, ou remboursée. */
  const order = async (
    email: string,
    status: "PAID" | "PENDING" | "REFUNDED",
    ticketTypeId: string,
    quantity: number,
    extra: { presaleCodeId?: string; createdAt?: Date } = {},
  ) => {
    const o = await db.order.create({
      data: {
        reference: `R${rid()}`,
        organizationId: org.id,
        eventId: event.id,
        status,
        source: "ONLINE",
        buyerEmail: email,
        buyerEmailKey: buyerEmailKey(email),
        buyerFirstName: "Léa",
        buyerLastName: "Martin",
        currency: "EUR",
        subtotalMinor: 0,
        totalMinor: 0,
        feeSnapshot: {},
        accessTokenHash: rid() + rid(),
        ...extra,
      },
    });
    const item = await db.orderItem.create({
      data: { orderId: o.id, ticketTypeId, quantity, unitPriceMinor: 2000 },
    });
    if (status !== "PENDING")
      for (let n = 0; n < quantity; n++)
        await db.ticket.create({
          data: {
            eventId: event.id,
            orderId: o.id,
            orderItemId: item.id,
            ticketTypeId,
            code: rid() + rid(),
            shortCode: rid(),
            faceValueMinor: 2000,
            status: status === "PAID" ? "VALID" : "REFUNDED",
          },
        });
    return o;
  };
  return { event, fosse, balcon, order };
}
const check = (
  s: Awaited<ReturnType<typeof setup>>,
  email: string,
  items: { ticketTypeId: string; quantity: number }[],
  extra: { promoCodeId?: string; presaleCodeId?: string } = {},
) =>
  checkBuyerLimits({
    orderId: "current",
    eventId: s.event.id,
    key: buyerEmailKey(email)!,
    items,
    promoCodeId: extra.promoCodeId ?? null,
    presaleCodeId: extra.presaleCodeId ?? null,
  });

describe("limites par acheteur", () => {
  it("événement : billets payés et paniers en cours comptés, remboursés exclus, variantes de l'adresse reconnues, panier abandonné oublié", async () => {
    const s = await setup();
    await db.event.update({
      where: { id: s.event.id },
      data: { maxTicketsPerBuyer: 4 },
    });
    await s.order("lea.martin@gmail.com", "PAID", s.fosse.id, 2);
    await s.order("leamartin+2@gmail.com", "PENDING", s.balcon.id, 1); // autre onglet, autre variante
    await s.order("lea.martin@gmail.com", "REFUNDED", s.fosse.id, 3);
    await s.order("lea.martin@gmail.com", "PENDING", s.fosse.id, 5, {
      createdAt: new Date(Date.now() - 60 * 60_000),
    }); // abandonné depuis une heure
    await expect(
      check(s, "LEA.MARTIN@gmail.com", [
        { ticketTypeId: s.fosse.id, quantity: 1 },
      ]),
    ).resolves.toBeUndefined();
    await expect(
      check(s, "lea.martin@gmail.com", [
        { ticketTypeId: s.fosse.id, quantity: 2 },
      ]),
    ).rejects.toMatchObject({ code: "BUYER_LIMIT_REACHED" });
    await expect(
      check(s, "tom@exemple.fr", [{ ticketTypeId: s.fosse.id, quantity: 4 }]),
    ).resolves.toBeUndefined();
  });

  it("par tarif : « 2 billets Fosse par personne », l'autre tarif reste libre", async () => {
    const s = await setup();
    await db.ticketType.update({
      where: { id: s.fosse.id },
      data: { maxPerBuyer: 2 },
    });
    await s.order("ines@exemple.fr", "PAID", s.fosse.id, 2);
    await expect(
      check(s, "ines@exemple.fr", [{ ticketTypeId: s.fosse.id, quantity: 1 }]),
    ).rejects.toMatchObject({ code: "BUYER_TYPE_LIMIT_REACHED" });
    await expect(
      check(s, "ines@exemple.fr", [{ ticketTypeId: s.balcon.id, quantity: 3 }]),
    ).resolves.toBeUndefined();
  });

  it("prévente : seules les commandes passées avec un code de prévente comptent ; code promo qui relève la limite, jamais ne l'abaisse", async () => {
    const s = await setup();
    const presale = await db.presaleCode.create({
      data: { eventId: s.event.id, code: `PRE${rid()}`, maxUses: 100 },
    });
    await db.event.update({
      where: { id: s.event.id },
      data: { presaleMaxTicketsPerBuyer: 2, maxTicketsPerBuyer: 6 },
    });
    await s.order("nora@exemple.fr", "PAID", s.fosse.id, 2, {
      presaleCodeId: presale.id,
    });
    await s.order("nora@exemple.fr", "PAID", s.fosse.id, 1); // achetée après la prévente
    await expect(
      check(s, "nora@exemple.fr", [{ ticketTypeId: s.fosse.id, quantity: 1 }], {
        presaleCodeId: presale.id,
      }),
    ).rejects.toMatchObject({ code: "PRESALE_BUYER_LIMIT_REACHED" });
    await expect(
      check(s, "nora@exemple.fr", [{ ticketTypeId: s.fosse.id, quantity: 3 }]),
    ).resolves.toBeUndefined(); // 3 + 3 = 6
    const group = await db.promoCode.create({
      data: {
        eventId: s.event.id,
        code: `GROUPE${rid()}`.toUpperCase(),
        discountType: "PERCENT",
        percentOffBps: 0,
        raisesLimitTo: 30,
      },
    });
    await expect(
      check(
        s,
        "nora@exemple.fr",
        [{ ticketTypeId: s.fosse.id, quantity: 20 }],
        { promoCodeId: group.id },
      ),
    ).resolves.toBeUndefined();
    const small = await db.promoCode.create({
      data: {
        eventId: s.event.id,
        code: `PETIT${rid()}`.toUpperCase(),
        discountType: "PERCENT",
        percentOffBps: 0,
        raisesLimitTo: 1,
      },
    });
    await expect(
      check(s, "nora@exemple.fr", [{ ticketTypeId: s.fosse.id, quantity: 3 }], {
        promoCodeId: small.id,
      }),
    ).resolves.toBeUndefined(); // jamais abaissée
  });
});

describe("adresse normalisée : la migration et l'application suivent la même règle", () => {
  it("la migration remplit les commandes existantes exactement comme buyerEmailKey", async () => {
    const s = await setup();
    const emails = [
      "Lea.Martin+concert@GMAIL.com",
      "l.e.a@googlemail.com",
      "tom+2@outlook.fr",
      "ines+billets@icloud.com",
      "jean.dupont+asso@exemple.be",
      " Nora@Exemple.FR ",
    ];
    const orders = [];
    for (const e of emails) {
      const o = await s.order(e, "PENDING", s.fosse.id, 1);
      await db.order.update({
        where: { id: o.id },
        data: { buyerEmailKey: null },
      });
      orders.push(o);
    }
    const sql = readFileSync(
      new URL(
        "../../../packages/db/prisma/migrations/20261027120000_limites_achat/migration.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await db.$executeRawUnsafe(sql.slice(sql.indexOf("WITH e AS")));
    const after = await db.order.findMany({
      where: { id: { in: orders.map((o) => o.id) } },
      select: { buyerEmail: true, buyerEmailKey: true },
    });
    for (const o of after)
      expect(o.buyerEmailKey).toBe(buyerEmailKey(o.buyerEmail));
  });
});
