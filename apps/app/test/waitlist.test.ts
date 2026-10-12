import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { finalizeOrder, releaseExpiredHolds, reserveOrder } from "@/server/checkout";
import { afterOrderPaid } from "@/server/orders";
import { dispatchWaitlist, joinWaitlist, leaveWaitlist } from "@/server/waitlist";

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
    expect(await dispatchWaitlist()).toMatchObject({ offered: 1 });
    expect(await db.waitlistEntry.findUniqueOrThrow({ where: { id: ea.id } })).toMatchObject({ status: "OFFERED", offeredQuantity: 1 });
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: eb.id } })).status).toBe("WAITING");
    expect(await sent(a, "waitlist.offer")).toBe(1);
    await expect(reserveOrder(panier(1))).rejects.toThrow(); // le public attend toujours
    // A achète avec son lien, sans dépasser ce qui lui est proposé
    await expect(reserveOrder(panier(2, { waitlistToken: ea.token }))).rejects.toThrow();
    const ra = await reserveOrder(panier(1, { waitlistToken: ea.token }));
    await payer(ra.orderId);
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: ea.id } })).status).toBe("PURCHASED");
    // une autre place se libère (remboursement simulé) : elle va à B, qui la laisse passer
    await db.ticketType.update({ where: { id: s.type.id }, data: { quantity: 3 } });
    expect(await dispatchWaitlist()).toMatchObject({ offered: 1 });
    expect(await db.waitlistEntry.findUniqueOrThrow({ where: { id: eb.id } })).toMatchObject({ status: "OFFERED", offeredQuantity: 1 });
    expect(await dispatchWaitlist(new Date(Date.now() + 31 * 60_000))).toMatchObject({ expired: 1, offered: 0 });
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: eb.id } })).status).toBe("EXPIRED");
    // plus personne n'attend : la place redevient vendable au public
    expect((await reserveOrder(panier(1))).orderId).toBeTruthy();
    // désinscription par le lien
    const c = `c.${rid()}@exemple.be`;
    const ec = await joinWaitlist(s.event.id, s.type.id, c, 1, "fr");
    await leaveWaitlist(ec.token);
    expect((await db.waitlistEntry.findUniqueOrThrow({ where: { id: ec.id } })).status).toBe("CANCELLED");
  });
});
