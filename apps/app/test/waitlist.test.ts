import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { finalizeOrder, releaseExpiredHolds, reserveOrder } from "@/server/checkout";
import { afterOrderPaid } from "@/server/orders";
import { loadPublicEvent } from "@/server/publicEvents";
import { publicListings } from "@/server/resale";
import { dispatchWaitlist, joinWaitlist, leaveWaitlist, offerResaleToWaitlist, waitlistOfferView } from "@/server/waitlist";

const DAY = 86_400_000;
const rid = () => Math.random().toString(36).slice(2, 10);

async function setup() {
  const id = rid();
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
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
      ticketTypes: { create: { name: "Entrée", priceMinor: 1000, currency: "EUR", quantity: 2 } },
    },
    include: { ticketTypes: true },
  });
  return { event, type: event.ticketTypes[0]! };
}
const payer = async (orderId: string) => {
  await db.order.update({ where: { id: orderId }, data: { buyerEmail: `p.${rid()}@exemple.be`, buyerFirstName: "Alex", buyerLastName: "Martin" } });
  expect(await finalizeOrder(orderId)).toBe("PAID");
  await afterOrderPaid(orderId);
};
const sent = (to: string, template: string) => db.emailMessage.count({ where: { toEmail: to, template } });

describe("liste d'attente (section 9.30)", () => {
  it("file d'attente : priorité aux inscrits, offre par lien personnel, achat, expiration, désinscription", async () => {
    const s = await setup();
    const panier = (q: number, extra: Record<string, unknown> = {}) => ({
      eventId: s.event.id,
      lines: [{ ticketTypeId: s.type.id, quantity: q }],
      locale: "fr",
      ...extra,
    });
    const a = `a.${rid()}@exemple.be`;
    const b = `b.${rid()}@exemple.be`;
    // il reste des places : pas de liste d'attente
    await expect(joinWaitlist(s.event.id, s.type.id, a, 1, "fr")).rejects.toMatchObject({ code: "WAITLIST_NOT_SOLD_OUT" });
    // complet : une place vendue, une retenue par une réservation qui va expirer
    await payer((await reserveOrder(panier(1))).orderId);
    await reserveOrder(panier(1), new Date(Date.now() - 60 * 60_000));
    const ea = await joinWaitlist(s.event.id, s.type.id, a, 1, "fr");
    const eb = await joinWaitlist(s.event.id, s.type.id, b, 2, "fr");
    expect((await joinWaitlist(s.event.id, s.type.id, a, 1, "fr")).id).toBe(ea.id); // déjà inscrit : même place dans la file
    expect(await sent(a, "waitlist.joined")).toBe(1);
    // la réservation expire : la place libérée n'est pas vendue au public, elle est proposée au premier inscrit
    expect(await releaseExpiredHolds()).toBeGreaterThanOrEqual(1);
    await expect(reserveOrder(panier(1))).rejects.toThrow();
    // la page de vente publique affiche le tarif complet, alors qu'une place est libre
    const publique = await loadPublicEvent({ id: s.event.id });
    expect(publique!.ticketTypes.find((t) => t.id === s.type.id)!.remaining).toBe(0);
    await dispatchWaitlist(); // la distribution traite toute la base : on vérifie nos propres inscriptions
    expect(await db.waitlistEntry.findUniqueOrThrow({ where: { id: ea.id } })).toMatchObject({ status: "OFFERED", offeredQuantity: 1 });
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: eb.id } })).status).toBe("WAITING");
    expect(await sent(a, "waitlist.offer")).toBe(1);
    // le lien personnel fait apparaître l'offre, avec le bon nombre de places
    expect(await waitlistOfferView(ea.token, s.event.id)).toMatchObject({ ticketTypeId: s.type.id, quantity: 1 });
    expect(await waitlistOfferView(eb.token, s.event.id)).toBeNull();
    await expect(reserveOrder(panier(1))).rejects.toThrow(); // le public attend toujours
    // A achète avec son lien, sans dépasser ce qui lui est proposé
    await expect(reserveOrder(panier(2, { waitlistToken: ea.token }))).rejects.toThrow();
    const ra = await reserveOrder(panier(1, { waitlistToken: ea.token }));
    await payer(ra.orderId);
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: ea.id } })).status).toBe("PURCHASED");
    // une autre place se libère (remboursement simulé) : elle va à B, qui la laisse passer
    await db.ticketType.update({ where: { id: s.type.id }, data: { quantity: 3 } });
    await dispatchWaitlist();
    expect(await db.waitlistEntry.findUniqueOrThrow({ where: { id: eb.id } })).toMatchObject({ status: "OFFERED", offeredQuantity: 1 });
    await dispatchWaitlist(new Date(Date.now() + 31 * 60_000));
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: eb.id } })).status).toBe("EXPIRED");
    // plus personne n'attend : la place redevient vendable au public
    expect((await reserveOrder(panier(1))).orderId).toBeTruthy();
    // désinscription par le lien
    const c = `c.${rid()}@exemple.be`;
    const ec = await joinWaitlist(s.event.id, s.type.id, c, 1, "fr");
    await leaveWaitlist(ec.token);
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: ec.id } })).status).toBe("CANCELLED");
  });

  it("revente : au choix de l'organisateur, d'abord aux inscrits pendant le délai choisi, ou à tous tout de suite", async () => {
    const s = await setup();
    await db.event.update({ where: { id: s.event.id }, data: { resaleWaitlistFirst: true, resaleWaitlistMinutes: 60 } });
    const vendre = async () => {
      const r = await reserveOrder({ eventId: s.event.id, lines: [{ ticketTypeId: s.type.id, quantity: 1 }], locale: "fr" });
      await payer(r.orderId);
      const ticket = await db.ticket.findFirstOrThrow({ where: { orderId: r.orderId } });
      const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId } });
      return db.resaleListing.create({
        data: {
          eventId: s.event.id,
          ticketId: ticket.id,
          sellerOrderId: order.id,
          sellerEmail: order.buyerEmail!,
          linkCode: `test-${rid()}`,
          priceMinor: 1000,
          faceValueMinor: 1000,
          currency: "EUR",
          expiresAt: new Date(Date.now() + 10 * DAY),
        },
      });
    };
    // les deux places sont vendues avant l'inscription de C : ensuite, le tarif est réservé aux inscrits
    const l1 = await vendre();
    const l2 = await vendre();
    const c = `c.${rid()}@exemple.be`;
    await db.waitlistEntry.create({ data: { eventId: s.event.id, ticketTypeId: s.type.id, email: c, token: `t-${rid()}` } });
    const visible = async (id: string, quand: Date) => (await publicListings(s.event.id, quand)).flatMap((g) => g.listings).some((l) => l.id === id);
    const now = new Date();
    expect(await offerResaleToWaitlist(l1.id, now)).toBe(1);
    expect(await sent(c, "waitlist.resale")).toBe(1);
    expect(await visible(l1.id, now)).toBe(false); // réservée aux inscrits pendant le délai
    expect(await visible(l1.id, new Date(now.getTime() + 61 * 60_000))).toBe(true); // puis proposée à tous
    // « proposée à tous » : visible tout de suite, sans e-mail
    await db.event.update({ where: { id: s.event.id }, data: { resaleWaitlistFirst: false } });
    expect(await offerResaleToWaitlist(l2.id, now)).toBe(0);
    expect(await visible(l2.id, now)).toBe(true);
    expect(await sent(c, "waitlist.resale")).toBe(1);
  });
});
