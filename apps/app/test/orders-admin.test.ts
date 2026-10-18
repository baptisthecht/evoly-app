import { sha256Hex } from "@evoly/core";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { orderAccessToken, reserveOrder, submitBuyer } from "@/server/checkout";
import type { OrgContext } from "@/server/context";
import { correctBuyerEmail, getOrderDetail, resendTickets, searchOrders, updateHolderByOrganizer } from "@/server/ordersAdmin";

const rid = () => Math.random().toString(36).slice(2, 10);

/** Une organisation, deux événements gratuits, et des commandes payées de Léa Martin et Tom Dubois. */
async function setup() {
  const id = rid();
  const org = await db.organization.create({ data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR" } });
  const event = (n: number) =>
    db.event.create({
      data: {
        organizationId: org.id,
        slug: `gala-${n}-${id}`,
        publicCode: `${n}${id}`.toUpperCase().slice(0, 8),
        title: `Gala ${n}`,
        currency: "EUR",
        timezone: "Europe/Brussels",
        startsAt: new Date(Date.now() + 5 * 86_400_000),
        status: "PUBLISHED",
        ticketTypes: {
          create: [
            { name: "Fosse", priceMinor: 0, currency: "EUR", quantity: 50, isNominative: true },
            { name: "Balcon", priceMinor: 0, currency: "EUR", quantity: 50, sortOrder: 1 },
          ],
        },
      },
      include: { ticketTypes: { orderBy: { sortOrder: "asc" } } },
    });
  const [e1, e2] = [await event(1), await event(2)];
  const buy = async (ev: typeof e1, type: 0 | 1, first: string, last: string) => {
    const r = await reserveOrder({ eventId: ev.id, lines: [{ ticketTypeId: ev.ticketTypes[type]!.id, quantity: 1 }], locale: "fr" });
    const holders = type === 0 ? { [r.lines[0]!.orderItemId]: [{ firstName: first, lastName: last }] } : undefined;
    expect(
      await submitBuyer(r.token, {
        firstName: first,
        lastName: last,
        email: `${first
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()}.${id}@exemple.be`,
        marketingOptIn: false,
        holders,
      }),
    ).toEqual({ kind: "PAID" });
    return db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { tickets: true } });
  };
  const lea = await buy(e1, 0, "Léa", "Martin");
  const tom = await buy(e2, 1, "Tom", "Dubois");
  const user = await db.user.create({ data: { name: "Orga", email: `orga.${id}@exemple.be`, emailVerified: true } });
  const ctx = { organization: { id: org.id }, user: { id: user.id } } as unknown as OrgContext;
  return { id, org, e1, e2, lea, tom, ctx };
}
const refs = async (ctx: OrgContext, opts: Parameters<typeof searchOrders>[1]) => (await searchOrders(ctx, opts)).rows.map((o) => o.id).sort();
const other = async () => {
  const id = rid();
  const o = await db.organization.create({ data: { name: "Autre", slug: `autre-${id}`, subdomain: `autre-${id}`, country: "BE", currency: "EUR" } });
  return { organization: { id: o.id }, user: { id: "x" } } as unknown as OrgContext;
};

describe("recherche des commandes (US-ORD-01)", () => {
  it("par e-mail, prénom, nom, prénom et nom ensemble, référence ou code court d'un billet, sans tenir compte des majuscules", async () => {
    const s = await setup();
    expect(await refs(s.ctx, { q: `LEA.${s.id}` })).toEqual([s.lea.id]);
    expect(await refs(s.ctx, { q: "tom" })).toEqual([s.tom.id]);
    expect(await refs(s.ctx, { q: "dubois" })).toEqual([s.tom.id]);
    expect(await refs(s.ctx, { q: "Léa Martin" })).toEqual([s.lea.id]);
    expect(await refs(s.ctx, { q: s.lea.reference.toLowerCase() })).toEqual([s.lea.id]);
    expect(await refs(s.ctx, { q: s.tom.tickets[0]!.shortCode.toLowerCase() })).toEqual([s.tom.id]);
    expect(await refs(s.ctx, { q: "personne" })).toEqual([]);
    expect(await refs(s.ctx, { q: "   " })).toEqual([s.lea.id, s.tom.id].sort());
  });

  it("filtres par événement, par tarif et par statut", async () => {
    const s = await setup();
    expect(await refs(s.ctx, { eventId: s.e2.id })).toEqual([s.tom.id]);
    expect(await refs(s.ctx, { ticketTypeId: s.e1.ticketTypes[0]!.id })).toEqual([s.lea.id]);
    await db.order.update({ where: { id: s.tom.id }, data: { status: "REFUNDED" } });
    expect(await refs(s.ctx, { filter: "REFUNDED" })).toEqual([s.tom.id]);
    expect(await refs(s.ctx, { filter: "PAID" })).toEqual([s.lea.id]);
    expect(await refs(s.ctx, { filter: "PARTIALLY_REFUNDED" })).toEqual([]);
  });

  it("demandes de remboursement en attente ou en échec : filtres et compteur des demandes", async () => {
    const s = await setup();
    await db.refund.create({ data: { orderId: s.lea.id, initiator: "BUYER", reason: "BUYER_REQUEST", amountMinor: 0, status: "REQUESTED" } });
    await db.refund.create({ data: { orderId: s.tom.id, initiator: "ORGANIZER", reason: "OTHER", amountMinor: 0, status: "FAILED" } });
    const r = await searchOrders(s.ctx, { filter: "REFUND_REQUESTED" });
    expect(r.rows.map((o) => o.id)).toEqual([s.lea.id]);
    expect(r.pendingRequests).toBe(1);
    expect(await refs(s.ctx, { filter: "REFUND_FAILED" })).toEqual([s.tom.id]);
  });

  it("cloisonnement : une autre organisation ne voit jamais ces commandes, ni leur détail", async () => {
    const s = await setup();
    const o = await other();
    expect((await searchOrders(o, {})).total).toBe(0);
    expect(await getOrderDetail(o, s.lea.id).catch(() => null)).toBeNull();
    expect((await getOrderDetail(s.ctx, s.lea.id))?.id).toBe(s.lea.id);
  });
});

describe("actions sur une commande (RG-ORD-01, RG-ORD-02, US-ORD-02)", () => {
  it("renvoi des billets : e-mail renvoyé et journalisé ; refusé pour une autre organisation ou une commande non payée", async () => {
    const s = await setup();
    const before = await db.emailMessage.count({ where: { orderId: s.lea.id } });
    await resendTickets(s.ctx, s.lea.id);
    expect(await db.emailMessage.count({ where: { orderId: s.lea.id } })).toBe(before + 1);
    await expect(resendTickets(await other(), s.lea.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db.order.update({ where: { id: s.tom.id }, data: { status: "REFUNDED" } });
    await expect(resendTickets(s.ctx, s.tom.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("correction de l'e-mail : adresse normalisée, ancien lien invalidé, billets envoyés à la nouvelle adresse", async () => {
    const s = await setup();
    const old = await db.order.findUniqueOrThrow({ where: { id: s.lea.id } });
    await correctBuyerEmail(s.ctx, s.lea.id, `  Lea.Nouvelle.${s.id}@Exemple.BE `);
    const now = await db.order.findUniqueOrThrow({ where: { id: s.lea.id } });
    expect(now.buyerEmail).toBe(`lea.nouvelle.${s.id}@exemple.be`);
    expect(now.accessTokenVersion).toBe(old.accessTokenVersion + 1);
    expect(now.accessTokenHash).toBe(await sha256Hex(orderAccessToken(s.lea.id, now.accessTokenVersion)));
    expect(now.accessTokenHash).not.toBe(await sha256Hex(orderAccessToken(s.lea.id, old.accessTokenVersion))); // l'ancien lien ne marche plus
    expect(await db.emailMessage.count({ where: { orderId: s.lea.id, template: "order.email_changed", toEmail: now.buyerEmail } })).toBe(1);
  });

  it("adresse invalide : refusée sans rien toucher (l'ancien lien reste valable)", async () => {
    const s = await setup();
    const old = await db.order.findUniqueOrThrow({ where: { id: s.lea.id } });
    for (const bad of ["lea@exemple", "pas une adresse", "", "@exemple.be"])
      await expect(correctBuyerEmail(s.ctx, s.lea.id, bad)).rejects.toMatchObject({ code: "ORDER_EMAIL_INVALID" });
    expect(await db.order.findUniqueOrThrow({ where: { id: s.lea.id } })).toMatchObject({
      buyerEmail: old.buyerEmail,
      accessTokenVersion: old.accessTokenVersion,
      accessTokenHash: old.accessTokenHash,
    });
    await expect(correctBuyerEmail(await other(), s.lea.id, `x.${s.id}@exemple.be`)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("changement de titulaire : noms nettoyés ; noms vides refusés ; billet d'une autre commande introuvable", async () => {
    const s = await setup();
    const ticket = s.lea.tickets[0]!;
    await updateHolderByOrganizer(s.ctx, s.lea.id, ticket.id, { firstName: "  Zoé ", lastName: " Lambert  " });
    expect(await db.ticket.findUniqueOrThrow({ where: { id: ticket.id } })).toMatchObject({ holderFirstName: "Zoé", holderLastName: "Lambert" });
    await expect(updateHolderByOrganizer(s.ctx, s.lea.id, ticket.id, { firstName: "  ", lastName: "Lambert" })).rejects.toMatchObject({
      code: "HOLDER_NAME_REQUIRED",
    });
    await expect(updateHolderByOrganizer(s.ctx, s.lea.id, ticket.id, { firstName: "Zoé", lastName: "" })).rejects.toMatchObject({
      code: "HOLDER_NAME_REQUIRED",
    });
    await expect(updateHolderByOrganizer(s.ctx, s.tom.id, ticket.id, { firstName: "A", lastName: "B" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(updateHolderByOrganizer(await other(), s.lea.id, ticket.id, { firstName: "A", lastName: "B" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
