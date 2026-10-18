import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { finalizeOrder, reserveOrder } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import { createOption, optionConflicts, redeemOption, syncOptionRedemptions } from "@/server/options";
import { refundOptions } from "@/server/refunds";
import { createScannerLink, resolveScannerLink, scannerManifest, scannerToken } from "@/server/scanner";

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;
const COUPURE = Date.now() - 60 * 60_000; // la coupure, il y a une heure : une seule heure de référence pour tout le fichier
const at = (minutes: number) => new Date(COUPURE + minutes * 60_000).toISOString();

async function setup() {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  await db.subscription.create({ data: { organizationId: org.id, planId: "pro", status: "ACTIVE" } });
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
  const jeton = await createOption(ctx, event.id, { name: "Jeton boisson", price: "3" });
  const r = await reserveOrder({
    eventId: event.id,
    lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }],
    options: [{ optionId: jeton.id, quantity: 3 }],
    locale: "fr",
  });
  await db.order.update({ where: { id: r.orderId }, data: { buyerEmail: `a.${id}@exemple.be`, buyerFirstName: "Alex", buyerLastName: "Martin" } });
  expect(await finalizeOrder(r.orderId)).toBe("PAID");
  const order = await db.order.findUniqueOrThrow({ where: { id: r.orderId }, include: { options: true, tickets: true } });
  return { ctx, event, order, line: order.options[0]! };
}
const etat = (id: string) => db.orderOption.findUniqueOrThrow({ where: { id }, select: { redeemed: true, refunded: true } });

describe("retrait des options sans réseau (RG-OPT-05)", () => {
  it("la liste téléchargée par le téléphone contient les options de chaque commande, reliées à ses billets", async () => {
    const s = await setup();
    const created = await createScannerLink(s.ctx, s.event.id, { label: "Bar", duration: "24H", allowManualSearch: true });
    const link = (await resolveScannerLink(scannerToken(created.id)))!.link;
    await redeemOption(s.event.id, s.line.id, 1, { staffName: "Bar" });
    const m = await scannerManifest(link);
    expect(m.tickets.find((t) => t.id === s.order.tickets[0]!.id)!.orderId).toBe(s.order.id);
    expect(m.options[s.order.id]).toEqual([{ id: s.line.id, name: "Jeton boisson", quantity: 3, redeemed: 1, left: 2 }]);
  });

  it("deux téléphones coupés du réseau : retraits rejoués dans l'ordre, chacun dans la limite de ce qui reste ; le surplus refusé et signalé", async () => {
    const s = await setup();
    // téléphone A : 2 jetons ; téléphone B : 2 jetons ; il n'y en a que 3
    const a = await syncOptionRedemptions(s.event.id, [
      { clientId: "a2", orderOptionId: s.line.id, quantity: 1, at: at(20), deviceId: "tel-A", staffName: "Bar 1" },
      { clientId: "a1", orderOptionId: s.line.id, quantity: 1, at: at(10), deviceId: "tel-A", staffName: "Bar 1" },
    ]);
    expect(a.map((r) => [r.clientId, r.redeemed, r.refused, r.left])).toEqual([
      ["a1", 1, 0, 2],
      ["a2", 1, 0, 1],
    ]); // dans l'ordre où ils ont eu lieu
    const b = await syncOptionRedemptions(s.event.id, [
      { clientId: "b1", orderOptionId: s.line.id, quantity: 1, at: at(15), deviceId: "tel-B", staffName: "Bar 2" },
      { clientId: "b2", orderOptionId: s.line.id, quantity: 1, at: at(30), deviceId: "tel-B", staffName: "Bar 2" },
    ]);
    expect(b.map((r) => [r.clientId, r.redeemed, r.refused])).toEqual([
      ["b1", 1, 0],
      ["b2", 0, 1],
    ]);
    expect(await etat(s.line.id)).toEqual({ redeemed: 3, refunded: 0 }); // jamais plus que vendu
    const faits = await db.optionRedemption.findMany({ where: { orderOptionId: s.line.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    expect(faits.map((f) => [f.deviceId, f.offline, f.createdAt.toISOString()])).toEqual([
      ["tel-A", true, at(10)],
      ["tel-B", true, at(15)],
      ["tel-A", true, at(20)],
    ]); // heure réelle du retrait
    const conflits = await optionConflicts(s.ctx, s.event.id);
    expect(
      conflits.map((c) => [c.line.option.name, c.line.order.reference, c.requested, c.refused, c.deviceId, c.staffName, c.happenedAt.toISOString()]),
    ).toEqual([["Jeton boisson", s.order.reference, 1, 1, "tel-B", "Bar 2", at(30)]]);
  });

  it("option remboursée pendant la coupure : le retrait est refusé ; demande partielle : seulement ce qui reste", async () => {
    const s = await setup();
    await refundOptions(s.ctx, s.order.id, [{ orderOptionId: s.line.id, quantity: 2 }], null); // 1 jeton restant
    const r = await syncOptionRedemptions(s.event.id, [{ clientId: "x", orderOptionId: s.line.id, quantity: 3, at: at(5), deviceId: "tel-A" }]);
    expect(r).toEqual([{ clientId: "x", redeemed: 1, refused: 2, left: 0 }]);
    expect(await etat(s.line.id)).toEqual({ redeemed: 1, refunded: 2 });
    expect((await optionConflicts(s.ctx, s.event.id)).map((c) => [c.requested, c.refused])).toEqual([[3, 2]]);
  });

  it("retrait d'un autre événement ignoré ; heure dans le futur ramenée à maintenant ; quantité bornée", async () => {
    const s = await setup();
    const autre = await setup();
    const r = await syncOptionRedemptions(s.event.id, [{ clientId: "x", orderOptionId: autre.line.id, quantity: 1, at: at(5) }]);
    expect(r).toEqual([{ clientId: "x", redeemed: 0, refused: 1, left: 0 }]);
    expect(await etat(autre.line.id)).toEqual({ redeemed: 0, refunded: 0 });
    expect(await db.optionRedemptionConflict.count({ where: { orderOptionId: autre.line.id } })).toBe(0); // rien à signaler à l'autre organisateur
    const futur = new Date(Date.now() + 3 * DAY).toISOString();
    expect((await syncOptionRedemptions(s.event.id, [{ clientId: "y", orderOptionId: s.line.id, quantity: 50, at: futur }]))[0]).toMatchObject({
      redeemed: 3,
      refused: 17,
    });
    const fait = await db.optionRedemption.findFirstOrThrow({ where: { orderOptionId: s.line.id } });
    expect(fait.createdAt.getTime()).toBeLessThanOrEqual(Date.now());
  });
});
