import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { findOrgContext } from "@/server/context";
import {
  createPromo,
  deletePromo,
  listPromos,
  setPromoActive,
} from "@/server/promos";

const DAY = 86_400_000;
const rid = () => Math.random().toString(36).slice(2, 10);

async function setup() {
  const id = rid();
  const owner = await db.user.create({
    data: {
      name: "Camille Dupont",
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
  const ownerRole = await db.role.findFirstOrThrow({
    where: { systemKey: "OWNER" },
  });
  await db.organizationMember.create({
    data: {
      organizationId: org.id,
      userId: owner.id,
      roleId: ownerRole.id,
      status: "ACTIVE",
    },
  });
  await db.subscription.create({
    data: { organizationId: org.id, planId: "pro", status: "ACTIVE" },
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
      ticketTypes: {
        create: {
          name: "Entrée",
          priceMinor: 1000,
          currency: "EUR",
          quantity: 100,
        },
      },
    },
    include: { ticketTypes: true },
  });
  const ctx = {
    ...(await findOrgContext(owner.id, org.slug))!,
    user: { id: owner.id, name: owner.name ?? "", email: owner.email },
  };
  return { event, type: event.ticketTypes[0]!, ctx };
}
const base = {
  discountType: "PERCENT" as const,
  percent: "10",
  ticketTypeIds: [] as string[],
  unlocksHidden: false,
};

describe("codes promo (US-PRM-01)", () => {
  it("création : code saisi normalisé ou généré, pourcentage, montant fixe ou gratuité, limité à des tarifs", async () => {
    const s = await setup();
    const p = await createPromo(s.ctx, s.event.id, { ...base, code: "ete-26" });
    expect(p).toMatchObject({
      code: "ETE-26",
      discountType: "PERCENT",
      percentOffBps: 1000,
    });
    const genere = await createPromo(s.ctx, s.event.id, {
      ...base,
      code: null,
    });
    expect(genere.code).toMatch(/^[A-Z0-9]{8}$/);
    expect(
      await createPromo(s.ctx, s.event.id, {
        ...base,
        code: "MOINS5",
        discountType: "AMOUNT",
        amount: "5",
        ticketTypeIds: [s.type.id],
      }),
    ).toMatchObject({
      amountOffMinor: 500,
      ticketTypeIds: [s.type.id],
    });
    expect(
      await createPromo(s.ctx, s.event.id, {
        ...base,
        code: "INVITE",
        discountType: "FREE",
      }),
    ).toMatchObject({ discountType: "FREE" });
    expect(
      (await listPromos(s.ctx, s.event.id)).map((x) => x.code).sort(),
    ).toEqual(["ETE-26", "INVITE", "MOINS5", genere.code].sort());
  });

  it("refus : format du code, pourcentage, montant, tarif d'un autre événement, dates, code déjà pris", async () => {
    const s = await setup();
    await expect(
      createPromo(s.ctx, s.event.id, { ...base, code: "ab" }),
    ).rejects.toMatchObject({ code: "PROMO_CODE_FORMAT" });
    await expect(
      createPromo(s.ctx, s.event.id, { ...base, code: "ZERO", percent: "0" }),
    ).rejects.toMatchObject({ code: "PROMO_PERCENT_INVALID" });
    await expect(
      createPromo(s.ctx, s.event.id, { ...base, code: "TROP", percent: "150" }),
    ).rejects.toMatchObject({ code: "PROMO_PERCENT_INVALID" });
    await expect(
      createPromo(s.ctx, s.event.id, {
        ...base,
        code: "VIDE",
        discountType: "AMOUNT",
        amount: "",
      }),
    ).rejects.toMatchObject({
      code: "PROMO_AMOUNT_INVALID",
    });
    await expect(
      createPromo(s.ctx, s.event.id, {
        ...base,
        code: "AUTRE",
        ticketTypeIds: ["tarif-inconnu"],
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      createPromo(s.ctx, s.event.id, {
        ...base,
        code: "DATES",
        startsAtLocal: "2026-12-10T10:00",
        expiresAtLocal: "2026-12-01T10:00",
      }),
    ).rejects.toMatchObject({ code: "PROMO_DATES_INVALID" });
    await createPromo(s.ctx, s.event.id, { ...base, code: "UNIQUE" });
    await expect(
      createPromo(s.ctx, s.event.id, { ...base, code: "unique" }),
    ).rejects.toMatchObject({ code: "PROMO_CODE_TAKEN" });
  });

  it("désactivation, et suppression refusée tant que le code a servi ou qu'une commande en cours l'utilise", async () => {
    const s = await setup();
    const p = await createPromo(s.ctx, s.event.id, { ...base, code: "NOEL" });
    await setPromoActive(s.ctx, s.event.id, p.id, false);
    expect(
      (await db.promoCode.findUniqueOrThrow({ where: { id: p.id } })).isActive,
    ).toBe(false);
    await expect(
      setPromoActive(s.ctx, s.event.id, "code-inconnu", true),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await db.promoCode.update({ where: { id: p.id }, data: { usedCount: 1 } });
    await expect(deletePromo(s.ctx, s.event.id, p.id)).rejects.toMatchObject({
      code: "PROMO_USED",
    });
    await db.promoCode.update({ where: { id: p.id }, data: { usedCount: 0 } });
    await deletePromo(s.ctx, s.event.id, p.id);
    expect(await db.promoCode.findUnique({ where: { id: p.id } })).toBeNull();
  });
});
