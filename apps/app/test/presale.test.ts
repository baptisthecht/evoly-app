import { describe, expect, it } from "vitest";
import { PRESALE_ALPHABET, utcToZonedLocal } from "@evoly/core";
import { db } from "@/lib/db";
import { CartRejected, reserveOrder, submitBuyer } from "@/server/checkout";
import type { OrgContext } from "@/server/context";
import { generatePresaleCodes, presaleCsv, presaleOverview, savePresaleStart, setPresaleCodeActive } from "@/server/presale";
import { loadPublicEvent } from "@/server/publicEvents";

const rid = () => Math.random().toString(36).slice(2, 10);
const days = (n: number) => new Date(Date.now() + n * 86_400_000);
const buyer = (email: string) => ({ firstName: "Léa", lastName: "Martin", email, marketingOptIn: false });

async function setup(o: { publishAt?: Date | null; mode?: "HIDDEN" | "TEASER"; salesStartAt?: Date | null; plan?: "free" | "pro" } = {}) {
  const id = rid();
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  if (o.plan !== "free") await db.subscription.create({ data: { organizationId: org.id, planId: "pro", status: "ACTIVE", currentPeriodEnd: days(60) } });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Gala ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: days(30),
      status: "PUBLISHED",
      visibility: "PUBLIC",
      salesStartAt: o.salesStartAt === undefined ? days(5) : o.salesStartAt,
      publishAt: o.publishAt ?? null,
      prePublishMode: o.mode ?? "HIDDEN",
      ticketTypes: { create: [{ name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 100, sortOrder: 0 }] },
    },
    include: { ticketTypes: true },
  });
  const features = o.plan === "free" ? [] : ["PRESALE_CODES"];
  return { org, event, ctx: { organization: org, features } as unknown as OrgContext };
}
const reserve = (eventId: string, ticketTypeId: string, presaleCode?: string) =>
  reserveOrder({ eventId, lines: [{ ticketTypeId, quantity: 1 }], locale: "fr", presaleCode: presaleCode ?? null });

describe("prévente privée (RG-PRV-01, RG-PRV-02)", () => {
  it("N codes utilisables X fois : usage unique en masse, code partagé personnalisé, plusieurs codes à usages multiples", async () => {
    const { event, ctx } = await setup();
    expect(await generatePresaleCodes(ctx, event.id, { quantity: 500, usesPerCode: 1, customCode: null, label: "Adhérents" })).toBe(500);
    const codes = await db.presaleCode.findMany({ where: { eventId: event.id } });
    expect(new Set(codes.map((c) => c.code)).size).toBe(500);
    expect(codes.every((c) => c.code.length === 8 && [...c.code].every((ch) => PRESALE_ALPHABET.includes(ch)) && c.maxUses === 1)).toBe(true);
    expect(await generatePresaleCodes(ctx, event.id, { quantity: 1, usesPerCode: 200, customCode: " membres 2026 ", label: null })).toBe(1);
    expect((await db.presaleCode.findUniqueOrThrow({ where: { eventId_code: { eventId: event.id, code: "MEMBRES2026" } } })).maxUses).toBe(200);
    await expect(generatePresaleCodes(ctx, event.id, { quantity: 1, usesPerCode: 5, customCode: "membres2026", label: null })).rejects.toMatchObject({
      code: "PRESALE_CODE_TAKEN",
    });
    await expect(generatePresaleCodes(ctx, event.id, { quantity: 2, usesPerCode: 5, customCode: "AUTRE", label: null })).rejects.toMatchObject({
      code: "INVALID_INPUT",
    });
    expect(await generatePresaleCodes(ctx, event.id, { quantity: 10, usesPerCode: 20, customCode: null, label: "Partenaires" })).toBe(10);
    const o = await presaleOverview(event.id);
    expect(o.count).toBe(511);
    expect(o.capacity).toBe(500 + 200 + 200);
    expect(o.codes).toHaveLength(50);
  });

  it("avant l'ouverture : refusé sans code, accepté avec ; usage unique compté avec les réservations en cours, puis au paiement", async () => {
    const { event, ctx } = await setup();
    const typeId = event.ticketTypes[0]!.id;
    await generatePresaleCodes(ctx, event.id, { quantity: 1, usesPerCode: 1, customCode: "SOLO1", label: null });
    await expect(reserve(event.id, typeId)).rejects.toBeInstanceOf(CartRejected);
    const r = await reserve(event.id, typeId, "solo1");
    expect((await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).presaleCodeId).not.toBeNull();
    await expect(reserve(event.id, typeId, "SOLO1")).rejects.toMatchObject({ code: "PRESALE_EXHAUSTED" });
    await submitBuyer(r.token, buyer(`lea.${rid()}@exemple.be`));
    expect((await db.presaleCode.findFirstOrThrow({ where: { eventId: event.id, code: "SOLO1" } })).usedCount).toBe(1);
  });

  it("code désactivé ou prévente pas encore commencée : refusé", async () => {
    const { event, ctx } = await setup();
    const typeId = event.ticketTypes[0]!.id;
    await generatePresaleCodes(ctx, event.id, { quantity: 1, usesPerCode: 10, customCode: "PRESSE", label: null });
    const code = await db.presaleCode.findFirstOrThrow({ where: { eventId: event.id } });
    await setPresaleCodeActive(ctx, event.id, code.id, false);
    await expect(reserve(event.id, typeId, "PRESSE")).rejects.toMatchObject({ code: "PRESALE_INVALID" });
    await setPresaleCodeActive(ctx, event.id, code.id, true);
    await savePresaleStart(ctx, event.id, utcToZonedLocal(days(2), "Europe/Brussels"));
    await expect(reserve(event.id, typeId, "PRESSE")).rejects.toMatchObject({ code: "PRESALE_INVALID" });
    await savePresaleStart(ctx, event.id, null);
    await expect(reserve(event.id, typeId, "PRESSE")).resolves.toBeTruthy();
  });

  it("événement encore invisible : le code ouvre la page complète et la vente ; export CSV avec les liens", async () => {
    const { event, ctx } = await setup({ publishAt: days(3), mode: "HIDDEN", salesStartAt: null });
    await generatePresaleCodes(ctx, event.id, { quantity: 1, usesPerCode: 5, customCode: "VIP", label: "VIP" });
    const anonymous = await loadPublicEvent({ id: event.id });
    expect(anonymous!.prepublished).toBe(true);
    expect(anonymous!.salesOpen).toBe(false);
    expect(anonymous!.presale).toBe(false);
    const vip = await loadPublicEvent({ id: event.id }, { presaleCode: "vip" });
    expect(vip!.presale).toBe(true);
    expect(vip!.salesOpen).toBe(true);
    expect(vip!.ticketTypes[0]!.onSale).toBe(true);
    expect(await presaleCsv(ctx, event.id, "https://club.evoly.me/gala")).toContain('"VIP","VIP","5","0","actif","https://club.evoly.me/gala?prevente=VIP"');
  });

  it("réservée à Pro : une organisation en Free ne crée pas de codes et n'achète pas avec un code existant", async () => {
    const { event, ctx } = await setup({ plan: "free" });
    await expect(generatePresaleCodes(ctx, event.id, { quantity: 1, usesPerCode: 5, customCode: "ANCIEN", label: null })).rejects.toMatchObject({
      code: "PRO_REQUIRED",
    });
    await db.presaleCode.create({ data: { eventId: event.id, code: "ANCIEN", maxUses: 5 } });
    await expect(reserve(event.id, event.ticketTypes[0]!.id, "ANCIEN")).rejects.toMatchObject({ code: "PRESALE_INVALID" });
  });
});
