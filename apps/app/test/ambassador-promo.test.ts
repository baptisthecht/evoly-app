import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { ambassadorRanking, createAmbassador, listAmbassadors, removeAmbassadorPromo, setAmbassadorActive, setAmbassadorPromo } from "@/server/ambassadors";
import { finalizeOrder, reserveOrder } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import { createPromo } from "@/server/promos";

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;

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
type S = Awaited<ReturnType<typeof setup>>;
/** Achat réel : panier (code promo saisi, lien d'ambassadeur suivi), puis confirmation du paiement. */
async function acheter(s: S, quantity: number, opts: { promoCode?: string; ambassadorCode?: string }) {
  const r = await reserveOrder({
    eventId: s.event.id,
    lines: [{ ticketTypeId: s.type.id, quantity }],
    locale: "fr",
    promoCode: opts.promoCode ?? null,
    ambassadorCode: opts.ambassadorCode ?? null,
  });
  await db.order.update({ where: { id: r.orderId }, data: { buyerEmail: `acheteur.${rid()}@exemple.be`, buyerFirstName: "Alex", buyerLastName: "Martin" } });
  expect(await finalizeOrder(r.orderId)).toBe("PAID");
  return db.order.findUniqueOrThrow({ where: { id: r.orderId } });
}

describe("code promo d'un ambassadeur (RG-AMB-01)", () => {
  it("son code devient un code promo : remise appliquée, vente attribuée même sans son lien ; le code saisi l'emporte sur le lien d'un autre", async () => {
    const s = await setup("pro");
    const marie = await createAmbassador(s.ctx, s.event.id, { name: "Marie Dupont" });
    const paul = await createAmbassador(s.ctx, s.event.id, { name: "Paul Lambert" });
    const promo = await setAmbassadorPromo(s.ctx, s.event.id, marie.id, { discountType: "PERCENT", percent: "10" });
    expect([promo.code, promo.ambassadorId, promo.percentOffBps, promo.isActive, promo.unlocksHidden]).toEqual([
      marie.code.toUpperCase(),
      marie.id,
      1000,
      true,
      false,
    ]);

    // sans le lien : le code saisi suffit (en minuscules, comme l'acheteur le tape)
    const sansLien = await acheter(s, 2, { promoCode: marie.code });
    expect([sansLien.ambassadorId, sansLien.promoCodeId, sansLien.totalMinor]).toEqual([marie.id, promo.id, 1800]); // 2 × 10 € − 10 %
    // lien de Paul suivi, code de Marie saisi : la vente va à Marie (décidé le 16 octobre 2026)
    expect((await acheter(s, 1, { ambassadorCode: paul.code, promoCode: marie.code.toUpperCase() })).ambassadorId).toBe(marie.id);
    // lien de Paul sans code : à Paul, au prix normal
    const parPaul = await acheter(s, 1, { ambassadorCode: paul.code });
    expect([parPaul.ambassadorId, parPaul.promoCodeId, parPaul.totalMinor]).toEqual([paul.id, null, 1000]);

    expect((await ambassadorRanking(s.event.id)).map((a) => [a.name, a.tickets])).toEqual([
      ["Marie Dupont", 3],
      ["Paul Lambert", 1],
    ]);
    expect((await listAmbassadors(s.ctx, s.event.id)).map((a) => [a.name, a.promo?.code ?? null, a.promo?.usedCount ?? null])).toEqual([
      ["Marie Dupont", marie.code.toUpperCase(), 2],
      ["Paul Lambert", null, null],
    ]);
  });

  it("la réduction suit l'état de l'ambassadeur ; retirée : gardée désactivée si déjà utilisée, supprimée sinon ; une seule par ambassadeur ; code déjà pris ; Pro", async () => {
    const s = await setup("pro");
    const marie = await createAmbassador(s.ctx, s.event.id, { name: "Marie Dupont" });
    const promo = await setAmbassadorPromo(s.ctx, s.event.id, marie.id, { discountType: "AMOUNT", amount: "2" });
    expect((await acheter(s, 1, { promoCode: marie.code })).totalMinor).toBe(800);
    await expect(setAmbassadorPromo(s.ctx, s.event.id, marie.id, { discountType: "PERCENT", percent: "5" })).rejects.toMatchObject({
      code: "AMBASSADOR_PROMO_EXISTS",
    });

    // ambassadeur désactivé : son code est refusé ; réactivé : de nouveau accepté
    await setAmbassadorActive(s.ctx, s.event.id, marie.id, false);
    expect((await db.promoCode.findUniqueOrThrow({ where: { id: promo.id } })).isActive).toBe(false);
    await expect(reserveOrder({ eventId: s.event.id, lines: [{ ticketTypeId: s.type.id, quantity: 1 }], locale: "fr", promoCode: marie.code })).rejects.toThrow(
      /^PROMO_/,
    );
    await setAmbassadorActive(s.ctx, s.event.id, marie.id, true);
    expect((await acheter(s, 1, { promoCode: marie.code })).ambassadorId).toBe(marie.id);

    // retirée après usage : gardée dans les codes promo, désactivée et détachée
    await removeAmbassadorPromo(s.ctx, s.event.id, marie.id);
    expect(await db.promoCode.findUniqueOrThrow({ where: { id: promo.id } })).toMatchObject({ isActive: false, ambassadorId: null, usedCount: 2 });
    expect((await listAmbassadors(s.ctx, s.event.id))[0]!.promo).toBeNull();
    await expect(removeAmbassadorPromo(s.ctx, s.event.id, marie.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // jamais utilisée : supprimée
    const lea = await createAmbassador(s.ctx, s.event.id, { name: "Léa Martin" });
    const p2 = await setAmbassadorPromo(s.ctx, s.event.id, lea.id, { discountType: "PERCENT", percent: "15" });
    await removeAmbassadorPromo(s.ctx, s.event.id, lea.id);
    expect(await db.promoCode.findUnique({ where: { id: p2.id } })).toBeNull();

    // code déjà pris par un code promo ordinaire de l'événement
    const zoe = await createAmbassador(s.ctx, s.event.id, { name: "Zoé Leroy" });
    await createPromo(s.ctx, s.event.id, { code: zoe.code, discountType: "PERCENT", percent: "5", ticketTypeIds: [], unlocksHidden: false });
    await expect(setAmbassadorPromo(s.ctx, s.event.id, zoe.id, { discountType: "PERCENT", percent: "10" })).rejects.toMatchObject({ code: "PROMO_CODE_TAKEN" });
    await expect(setAmbassadorPromo(s.ctx, s.event.id, "inconnu", { discountType: "PERCENT", percent: "10" })).rejects.toMatchObject({ code: "NOT_FOUND" });

    // réservé au Pro
    const free = await setup("free");
    await expect(setAmbassadorPromo(free.ctx, free.event.id, marie.id, { discountType: "PERCENT", percent: "10" })).rejects.toMatchObject({
      code: "FEATURE_UNAVAILABLE",
    });
  });
});
