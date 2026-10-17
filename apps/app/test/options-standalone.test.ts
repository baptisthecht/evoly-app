import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { finalizeOrder, reserveOrder } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import { createOption, optionsForScan, redeemOption, saleOptions, updateOption } from "@/server/options";
import { ticketsPdfFor } from "@/server/orders";
import { createScannerLink, resolveScannerLink, scannerManifest, scannerToken } from "@/server/scanner";
import { sellCash } from "@/server/boxOffice";
import { refundOptions } from "@/server/refunds";

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;

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
  const vestiaire = await createOption(ctx, event.id, { name: "Vestiaire", price: "2", standalone: true });
  const jeton = await createOption(ctx, event.id, { name: "Jeton boisson", price: "3" });
  return { ctx, event, type: event.ticketTypes[0]!, vestiaire, jeton };
}
type S = Awaited<ReturnType<typeof setup>>;
async function payer(orderId: string) {
  await db.order.update({ where: { id: orderId }, data: { buyerEmail: `a.${rid()}@exemple.be`, buyerFirstName: "Alex", buyerLastName: "Martin" } });
  expect(await finalizeOrder(orderId)).toBe("PAID");
  return db.order.findUniqueOrThrow({ where: { id: orderId }, include: { tickets: true, options: true } });
}
const seules = (s: S, optionId: string, quantity: number) => reserveOrder({ eventId: s.event.id, lines: [], options: [{ optionId, quantity }], locale: "fr" });

describe("options achetées sans billet (RG-OPT-03)", () => {
  it("vendable sans billet : panier d'options seules accepté, codes de retrait, aucun billet, commission sur l'option ; sinon refusé", async () => {
    const s = await setup();
    expect([s.vestiaire.standalone, s.jeton.standalone]).toEqual([true, false]); // décochée par défaut
    expect((await saleOptions(s.event.id)).map((o) => [o.name, o.standalone])).toEqual([
      ["Vestiaire", true],
      ["Jeton boisson", false],
    ]);

    const o = await payer((await seules(s, s.vestiaire.id, 1)).orderId);
    expect([o.tickets.length, o.totalMinor, o.applicationFeeMinor, o.options[0]!.quantity]).toEqual([0, 200, 4, 1]); // 2 % de 2 €, sans part fixe
    expect(o.optionsCode).toMatch(/^[A-Za-z0-9_-]{24,}$/);
    expect(o.optionsShortCode).toBeTruthy();

    // une option qui exige un billet : refusée sans billet, acceptée avec un billet
    await expect(seules(s, s.jeton.id, 1)).rejects.toMatchObject({ code: "OPTION_NEEDS_TICKET" });
    await expect(
      reserveOrder({
        eventId: s.event.id,
        lines: [],
        options: [
          { optionId: s.vestiaire.id, quantity: 1 },
          { optionId: s.jeton.id, quantity: 1 },
        ],
        locale: "fr",
      }),
    ).rejects.toMatchObject({ code: "OPTION_NEEDS_TICKET" });
    const avecBillet = await payer(
      (
        await reserveOrder({
          eventId: s.event.id,
          lines: [{ ticketTypeId: s.type.id, quantity: 1 }],
          options: [{ optionId: s.jeton.id, quantity: 1 }],
          locale: "fr",
        })
      ).orderId,
    );
    expect([avecBillet.tickets.length, avecBillet.optionsCode]).toEqual([1, null]); // une commande ordinaire ne change pas
    // panier entièrement vide : toujours refusé
    await expect(reserveOrder({ eventId: s.event.id, lines: [], options: [], locale: "fr" })).rejects.toThrow();
    await expect(reserveOrder({ eventId: s.event.id, lines: [], options: [{ optionId: s.vestiaire.id, quantity: 0 }], locale: "fr" })).rejects.toThrow();

    // la case se modifie
    await updateOption(s.ctx, s.event.id, s.jeton.id, { name: "Jeton boisson", price: "3", standalone: true });
    expect((await payer((await seules(s, s.jeton.id, 2)).orderId)).totalMinor).toBe(600);
  });

  it("les autres vérifications de l'événement s'appliquent toujours : ventes closes", async () => {
    const s = await setup();
    await db.event.update({ where: { id: s.event.id }, data: { salesEndAt: new Date(Date.now() - DAY) } });
    await expect(seules(s, s.vestiaire.id, 1)).rejects.toThrow();
  });

  it("commande d'options seules : rembourser une partie ne rembourse pas tout ; remboursée quand toutes ses options l'ont été", async () => {
    const s = await setup();
    const o = await payer((await seules(s, s.vestiaire.id, 2)).orderId);
    await refundOptions(s.ctx, o.id, [{ orderOptionId: o.options[0]!.id, quantity: 1 }], null);
    expect((await db.orderOption.findUniqueOrThrow({ where: { id: o.options[0]!.id } })).refunded).toBe(1); // pas les deux
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ refundedMinor: 200, status: "PARTIALLY_REFUNDED" });
    await refundOptions(s.ctx, o.id, [{ orderOptionId: o.options[0]!.id, quantity: 1 }], null);
    expect(await db.order.findUniqueOrThrow({ where: { id: o.id } })).toMatchObject({ refundedMinor: 400, status: "REFUNDED" });
  });

  it("au bar : la commande retrouvée par son QR code de retrait et par son code court, dans cet événement seulement ; retrait comme d'habitude", async () => {
    const s = await setup();
    const o = await payer((await seules(s, s.vestiaire.id, 2)).orderId);
    const parQr = await optionsForScan(s.event.id, { code: o.optionsCode! });
    expect(parQr).toEqual({ holder: "Alex Martin", options: [expect.objectContaining({ id: o.options[0]!.id, name: "Vestiaire", quantity: 2, left: 2 })] });
    expect((await optionsForScan(s.event.id, { shortCode: o.optionsShortCode!.toLowerCase() })).options[0]!.id).toBe(o.options[0]!.id); // code court saisi en minuscules
    expect(await redeemOption(s.event.id, o.options[0]!.id, 1, { staffName: "Vestiaire" })).toEqual({ left: 1 });
    // un autre événement, ou un code inconnu : rien
    const autre = await setup();
    await expect(optionsForScan(autre.event.id, { code: o.optionsCode! })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(optionsForScan(s.event.id, { code: "inconnu-0000000000000000" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(optionsForScan(s.event.id, { shortCode: "ZZZZ-9999" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("liste du téléphone : le code de retrait y figure haché, jamais en clair, avec son code court et les options de la commande", async () => {
    const s = await setup();
    const o = await payer((await seules(s, s.vestiaire.id, 1)).orderId);
    const created = await createScannerLink(s.ctx, s.event.id, { label: "Vestiaire", duration: "24H", allowManualSearch: true });
    const link = (await resolveScannerLink(scannerToken(created.id)))!.link;
    const m = await scannerManifest(link);
    expect(m.passes).toEqual([
      {
        orderId: o.id,
        codeHash: createHash("sha256").update(`${link.id}:${o.optionsCode}`).digest("hex"),
        shortCode: o.optionsShortCode,
        holder: "Alex Martin",
      },
    ]);
    expect(JSON.stringify(m)).not.toContain(o.optionsCode!);
    expect(m.options[o.id]).toEqual([{ id: o.options[0]!.id, name: "Vestiaire", quantity: 1, redeemed: 0, left: 1 }]);
  });

  it("e-mail : le PDF d'une commande d'options seules a sa page « Retrait des options », jamais un PDF vide", async () => {
    const s = await setup();
    const o = await payer((await seules(s, s.vestiaire.id, 1)).orderId);
    const full = await db.order.findUniqueOrThrow({
      where: { id: o.id },
      include: {
        organization: true,
        event: true,
        tickets: { include: { ticketType: { select: { name: true } }, seat: { select: { label: true, row: { select: { name: true } } } } } },
        options: { include: { option: { select: { name: true } } } },
      },
    });
    expect((await PDFDocument.load(await ticketsPdfFor(full, "fr"))).getPageCount()).toBe(1);
  });

  it("vente sur place : seules les options vendables sans billet au catalogue ; en espèces, sans commission, aucun billet, un code de retrait qui retrouve la commande au bar", async () => {
    const s = await setup();
    const created = await createScannerLink(s.ctx, s.event.id, { label: "Vestiaire", duration: "24H", allowManualSearch: true, canSell: true });
    const link = (await resolveScannerLink(scannerToken(created.id)))!.link;
    expect((await scannerManifest(link)).sale!.options.map((o) => [o.name, o.priceMinor])).toEqual([["Vestiaire", 200]]); // le jeton exige un billet : absent
    const vente = await sellCash(link, { lines: [], options: [{ optionId: s.vestiaire.id, quantity: 2 }] });
    expect(vente.optionsShortCode).toBeTruthy();
    const o = await db.order.findUniqueOrThrow({ where: { id: vente.orderId }, include: { tickets: true, options: true } });
    expect([o.source, o.boxOfficeMode, o.status, o.totalMinor, o.applicationFeeMinor, o.tickets.length, o.options[0]!.unitFeeMinor]).toEqual([
      "BOX_OFFICE",
      "CASH",
      "PAID",
      400,
      0,
      0,
      0,
    ]);
    expect((await optionsForScan(s.event.id, { shortCode: vente.optionsShortCode! })).options[0]).toMatchObject({ name: "Vestiaire", left: 2 });
    await expect(sellCash(link, { lines: [], options: [{ optionId: s.jeton.id, quantity: 1 }] })).rejects.toMatchObject({ code: "OPTION_NEEDS_TICKET" });
  });
});
