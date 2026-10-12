import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ambassadorRanking, ambassadorStats, ambassadorsCsv, createAmbassador, setAmbassadorActive } from "@/server/ambassadors";
import { finalizeOrder, reserveOrder } from "@/server/checkout";
import { findOrgContext } from "@/server/context";

const DAY = 86_400_000;
const rid = () => Math.random().toString(36).slice(2, 10);

async function setup(plan: "pro" | "free") {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  if (plan === "pro") await db.subscription.create({ data: { organizationId: org.id, planId: "pro", status: "ACTIVE" } });
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
      ticketTypes: { create: { name: "Entrée", priceMinor: 1000, currency: "EUR", quantity: 100 } },
    },
    include: { ticketTypes: true },
  });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  return { event, type: event.ticketTypes[0]!, ctx };
}
const acheter = async (s: Awaited<ReturnType<typeof setup>>, quantity: number, ambassadorCode: string | null) => {
  const r = await reserveOrder({ eventId: s.event.id, lines: [{ ticketTypeId: s.type.id, quantity }], locale: "fr", ambassadorCode });
  await db.order.update({ where: { id: r.orderId }, data: { buyerEmail: `acheteur.${rid()}@exemple.be`, buyerFirstName: "Alex", buyerLastName: "Martin" } });
  expect(await finalizeOrder(r.orderId)).toBe("PAID");
  return db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { tickets: true } });
};

describe("ambassadeurs (section 9.28)", () => {
  it("réservé à l'offre Pro (RG-AMB-06)", async () => {
    const s = await setup("free");
    await expect(createAmbassador(s.ctx, s.event.id, { name: "Marie" })).rejects.toMatchObject({ code: "FEATURE_UNAVAILABLE" });
  });

  it("attribution au lien suivi, classement sans les remboursements, ambassadeur désactivé, page privée sans données d'acheteur, export", async () => {
    const s = await setup("pro");
    const marie = await createAmbassador(s.ctx, s.event.id, { name: "Marie Dupont", goal: "10", reward: "Une place offerte" });
    const sam = await createAmbassador(s.ctx, s.event.id, { name: "Sam" });
    expect(marie.code).toMatch(/^marie-[a-z2-9]{4}$/);
    const m = await acheter(s, 2, marie.code);
    expect(m.ambassadorId).toBe(marie.id);
    const sa = await acheter(s, 1, sam.code.toUpperCase()); // le code ne dépend pas de la casse
    expect(sa.ambassadorId).toBe(sam.id);
    expect((await acheter(s, 1, "inconnu-zz99")).ambassadorId).toBeNull(); // un mauvais lien n'empêche jamais l'achat
    expect((await ambassadorRanking(s.event.id)).map((a) => [a.name, a.tickets, a.amountMinor])).toEqual([
      ["Marie Dupont", 2, 2000],
      ["Sam", 1, 1000],
    ]);
    // un billet remboursé sort du classement ; un billet revendu y reste
    await db.ticket.update({ where: { id: m.tickets[0]!.id }, data: { status: "REFUNDED" } });
    await db.ticket.update({ where: { id: sa.tickets[0]!.id }, data: { status: "VOID", voidReason: "RESOLD" } });
    expect((await ambassadorRanking(s.event.id)).map((a) => [a.name, a.tickets])).toEqual([
      ["Marie Dupont", 1],
      ["Sam", 1],
    ]);
    await setAmbassadorActive(s.ctx, s.event.id, marie.id, false);
    expect((await acheter(s, 1, marie.code)).ambassadorId).toBeNull();
    const stats = await ambassadorStats(sam.statsToken);
    expect(stats).toMatchObject({ name: "Sam", tickets: 1, rank: 2, total: 2 });
    expect(stats!.leaderboard).toEqual([
      { name: "Marie Dupont", tickets: 1, me: false },
      { name: "Sam", tickets: 1, me: true },
    ]);
    expect(JSON.stringify(stats)).not.toContain("acheteur."); // aucune donnée d'acheteur
    expect(await ambassadorStats("jeton-inconnu")).toBeNull();
    const csv = await ambassadorsCsv(s.ctx, s.event.id);
    expect(csv).toContain('"Rang";"Nom"');
    expect(csv).toContain(`"${marie.code}"`);
  });
});
