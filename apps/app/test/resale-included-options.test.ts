import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import { optionsForScan, redeemOption } from "@/server/options";
import { createListing, reserveResale } from "@/server/resale";

const rid = () => Math.random().toString(36).slice(2, 10);

/** Une table (ou un billet simple) gratuite avec une option incluse, achetée par Léa. */
async function setup(opts: {
  groupSize: number;
  included: number;
  tableLabels?: string[];
}) {
  const id = rid();
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
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Gala ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 3 * 86_400_000),
      status: "PUBLISHED",
    },
  });
  const option = await db.eventOption.create({
    data: { eventId: event.id, name: "Boisson", priceMinor: 0 },
  });
  const type = await db.ticketType.create({
    data: {
      eventId: event.id,
      name: "Table VIP",
      priceMinor: 0,
      currency: "EUR",
      quantity: 10,
      groupSize: opts.groupSize,
      ...(opts.tableLabels ? { tableLabels: opts.tableLabels } : {}),
      includedOptions: {
        create: [{ optionId: option.id, quantity: opts.included }],
      },
    },
  });
  const r = await reserveOrder({
    eventId: event.id,
    lines: [{ ticketTypeId: type.id, quantity: 1 }],
    locale: "fr",
  });
  expect(
    await submitBuyer(r.token, {
      firstName: "Léa",
      lastName: "Martin",
      email: `lea.${id}@exemple.be`,
      marketingOptIn: false,
    }),
  ).toEqual({ kind: "PAID" });
  const seats = await db.ticket.findMany({
    where: { orderId: r.orderId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  expect(seats).toHaveLength(opts.groupSize);
  return {
    id,
    event,
    option,
    sellerToken: r.token,
    sellerOrderId: r.orderId,
    seats,
  };
}

/** Revend une place à un nouvel acheteur, par le vrai chemin : annonce, réservation, coordonnées, validation. */
async function resell(
  s: Awaited<ReturnType<typeof setup>>,
  ticketId: string,
  n: number,
) {
  const listing = await createListing(s.sellerToken, ticketId, "0");
  const r = await reserveResale(listing.linkCode, "fr");
  expect(
    await submitBuyer(r.token, {
      firstName: "Tom",
      lastName: `Acheteur ${n}`,
      email: `tom${n}.${s.id}@exemple.be`,
      marketingOptIn: false,
    }),
  ).toEqual({
    kind: "PAID",
  });
  const ticket = await db.ticket.findFirstOrThrow({
    where: { orderId: r.orderId },
  });
  return { orderId: r.orderId, ticket };
}
const left = async (eventId: string, code: string) =>
  (await optionsForScan(eventId, { code })).options.reduce(
    (n, o) => n + o.left,
    0,
  );

describe("revente d'une place avec des options incluses (section 9.31)", () => {
  it("table de 4 avec 4 boissons : la place revendue emporte 1 boisson, retrouvée au bar par l'acheteur ; le vendeur en garde 3", async () => {
    const s = await setup({ groupSize: 4, included: 4 });
    const sold = await resell(s, s.seats[0]!.id, 1);
    expect(await left(s.event.id, sold.ticket.code)).toBe(1);
    expect(await left(s.event.id, s.seats[1]!.code)).toBe(3);
    const lines = await db.orderOption.findMany({
      where: { optionId: s.option.id },
    });
    expect(lines.reduce((n, l) => n + l.quantity, 0)).toBe(4); // déplacé, jamais créé en plus
    expect(lines.every((l) => l.unitPriceMinor === 0)).toBe(true);
  });

  it("table de 4 avec 1 bouteille : les trois premières places revendues n'emportent rien, la dernière emporte la bouteille", async () => {
    const s = await setup({ groupSize: 4, included: 1 });
    for (const [n, seat] of s.seats.slice(0, 3).entries()) {
      const sold = await resell(s, seat.id, n + 1);
      expect(await left(s.event.id, sold.ticket.code)).toBe(0);
      expect(await left(s.event.id, s.seats[3]!.code)).toBe(1); // la bouteille reste à la table
    }
    const last = await resell(s, s.seats[3]!.id, 4);
    expect(await left(s.event.id, last.ticket.code)).toBe(1);
    expect(
      await db.orderOption.count({ where: { orderId: s.sellerOrderId } }),
    ).toBe(0); // le vendeur n'a plus rien
  });

  it("déjà servi au bar : rien n'est transmis au-delà de ce qui reste", async () => {
    const s = await setup({ groupSize: 4, included: 4 });
    const line = await db.orderOption.findFirstOrThrow({
      where: { orderId: s.sellerOrderId },
    });
    await redeemOption(s.event.id, line.id, 4);
    const sold = await resell(s, s.seats[0]!.id, 1);
    expect(await left(s.event.id, sold.ticket.code)).toBe(0);
    expect(
      await db.orderOption.findUniqueOrThrow({ where: { id: line.id } }),
    ).toMatchObject({ quantity: 4, redeemed: 4 });
  });

  it("billet simple avec une option incluse : la revente transmet toute l'option", async () => {
    const s = await setup({ groupSize: 1, included: 2 });
    const sold = await resell(s, s.seats[0]!.id, 1);
    expect(await left(s.event.id, sold.ticket.code)).toBe(2);
    expect(
      await db.orderOption.count({ where: { orderId: s.sellerOrderId } }),
    ).toBe(0);
  });

  it("la table du billet suit la revente : le nouveau billet garde son libellé", async () => {
    const s = await setup({
      groupSize: 2,
      included: 2,
      tableLabels: ["Table 7"],
    });
    expect(s.seats.map((t) => t.tableLabel)).toEqual(["Table 7", "Table 7"]);
    const sold = await resell(s, s.seats[0]!.id, 1);
    expect(sold.ticket.tableLabel).toBe("Table 7");
    expect(await left(s.event.id, sold.ticket.code)).toBe(1);
  });
});
