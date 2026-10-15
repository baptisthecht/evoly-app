import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { finalizeOrder, reserveOrder } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import { PDFDocument } from "pdf-lib";
import { financeOverview, issueStatement, optionsCsv, ordersCsv, statementOptionsFee, statementPdf, summarizeOptions } from "@/server/finances";
import { createOption, redeemOption } from "@/server/options";

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;
const cells = (line: string) => line.split(";");

async function organisation() {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  await db.subscription.create({ data: { organizationId: org.id, planId: "pro", status: "ACTIVE" } });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  return { org, ctx };
}
async function evenement(orgId: string, title: string) {
  const id = rid();
  return db.event.create({
    data: {
      organizationId: orgId,
      slug: `ev-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 20 * DAY),
      status: "PUBLISHED",
      ticketTypes: { create: { name: "Entrée", priceMinor: 1000, currency: "EUR", quantity: 100 } },
    },
    include: { ticketTypes: true },
  });
}
/** Achat réel : panier avec options, puis confirmation du paiement par le même chemin qu'après Stripe. */
async function achat(ev: { id: string; ticketTypes: { id: string }[] }, options: { optionId: string; quantity: number }[], payer = true) {
  const r = await reserveOrder({ eventId: ev.id, lines: [{ ticketTypeId: ev.ticketTypes[0]!.id, quantity: 1 }], options, locale: "fr" });
  if (payer) {
    await db.order.update({ where: { id: r.orderId }, data: { buyerEmail: `a.${rid()}@exemple.be`, buyerFirstName: "Alex", buyerLastName: "Martin" } });
    expect(await finalizeOrder(r.orderId)).toBe("PAID");
  }
  return r.orderId;
}
const ligne = (orderId: string, optionId: string) => db.orderOption.findFirstOrThrow({ where: { orderId, optionId } });

describe("options dans les finances et les exports (RG-OPT-08)", () => {
  it("vendues, retirées, montant et commission par option ; commande remboursée comptée en brut ; non payée et autre organisation exclues ; filtres événement et période", async () => {
    const { org, ctx } = await organisation();
    const soiree = await evenement(org.id, "Soirée blanche");
    const gala = await evenement(org.id, "Gala");
    const jeton = await createOption(ctx, soiree.id, { name: "Jeton boisson", price: "3" });
    const vestiaire = await createOption(ctx, soiree.id, { name: "Vestiaire", price: "2" });
    const parking = await createOption(ctx, gala.id, { name: "Parking", price: "5" });

    const c1 = await achat(soiree, [
      { optionId: jeton.id, quantity: 3 },
      { optionId: vestiaire.id, quantity: 1 },
    ]);
    expect(await redeemOption(soiree.id, (await ligne(c1, jeton.id)).id, 2, { staffName: "Bar 1" })).toEqual({ left: 1 });
    const c2 = await achat(soiree, [{ optionId: jeton.id, quantity: 1 }]);
    const total2 = (await db.order.findUniqueOrThrow({ where: { id: c2 } })).totalMinor;
    await db.order.update({ where: { id: c2 }, data: { status: "REFUNDED", refundedMinor: total2 } }); // remboursée : comptée en brut, comme les finances
    const c3 = await achat(gala, [{ optionId: parking.id, quantity: 2 }]);
    await achat(soiree, [{ optionId: jeton.id, quantity: 4 }], false); // réservée, jamais payée : exclue
    // autre organisation : jamais mélangée
    const autre = await organisation();
    const autreEv = await evenement(autre.org.id, "Autre");
    await achat(autreEv, [{ optionId: (await createOption(autre.ctx, autreEv.id, { name: "Jeton boisson", price: "3" })).id, quantity: 9 }]);

    // commission : 2 % du prix de chaque unité, sans part fixe (RG-OPT-06) ; jeton 3 € → 0,06 €, vestiaire 2 € → 0,04 €, parking 5 € → 0,10 €
    const o = (await financeOverview(ctx, { period: "ALL" })).options;
    expect(o.rows.map((r) => [r.name, r.eventTitle, r.sold, r.redeemed, r.amountMinor, r.feeMinor])).toEqual([
      ["Jeton boisson", "Soirée blanche", 4, 2, 1200, 24],
      ["Parking", "Gala", 2, 0, 1000, 20],
      ["Vestiaire", "Soirée blanche", 1, 0, 200, 4],
    ]);
    expect(o.totals).toEqual({ sold: 7, redeemed: 2, amountMinor: 2400, feeMinor: 48 });
    // filtre par événement
    expect((await financeOverview(ctx, { period: "ALL", eventId: gala.id })).options.rows.map((r) => r.name)).toEqual(["Parking"]);
    // filtre par période : une commande payée l'an dernier sort du mois en cours
    await db.order.update({ where: { id: c3 }, data: { paidAt: new Date(Date.now() - 400 * DAY) } });
    expect((await financeOverview(ctx, { period: "THIS_MONTH" })).options.rows.map((r) => r.name)).toEqual(["Jeton boisson", "Vestiaire"]);
    expect((await financeOverview(ctx, { period: "ALL" })).options.totals.sold).toBe(7);

    // export des commandes : deux colonnes ajoutées à la fin, aucune colonne existante décalée
    const commandes = (await ordersCsv(ctx, { period: "ALL" }))
      .replace(/^\uFEFF/, "")
      .trim()
      .split("\r\n");
    const head = cells(commandes[0]!);
    expect(head.slice(-3)).toEqual(["Moyen de paiement", "Options", "Montant des options"]);
    expect(head.indexOf("Montant")).toBe(6); // inchangé
    const ref1 = (await db.order.findUniqueOrThrow({ where: { id: c1 } })).reference;
    const l1 = cells(commandes.find((l) => l.startsWith(ref1))!);
    expect(l1.slice(-2)).toEqual(["3 × Jeton boisson, 1 × Vestiaire", "11,00"]);
    expect(commandes).toHaveLength(1 + 3); // trois commandes payées de cette organisation

    // export des options : une ligne par option vendue, avec ce qui a été retiré au bar
    const options = (await optionsCsv(ctx, { period: "ALL", eventId: soiree.id }))
      .replace(/^\uFEFF/, "")
      .trim()
      .split("\r\n");
    expect(cells(options[0]!)).toEqual([
      "Référence",
      "Date",
      "Événement",
      "Option",
      "Quantité",
      "Prix unitaire",
      "Montant",
      "Commission Evoly",
      "Retirées",
      "Devise",
      "Statut",
    ]);
    expect(options).toHaveLength(1 + 3); // c1 : jeton et vestiaire ; c2 : jeton
    const jetonC1 = options.map(cells).find((c) => c[3] === "Jeton boisson" && c[4] === "3")!;
    expect(jetonC1.slice(2)).toEqual(["Soirée blanche", "Jeton boisson", "3", "3,00", "9,00", "0,18", "2", "EUR", "PAID"]);
    expect(options.map(cells).some((c) => c[3] === "Jeton boisson" && c[10] === "REFUNDED")).toBe(true);
  });

  it("résumé des options : cas limites", () => {
    expect(summarizeOptions([], new Map())).toEqual({ rows: [], totals: { sold: 0, redeemed: 0, amountMinor: 0, feeMinor: 0 } });
    const option = (name: string) => ({ id: name, name, eventId: "ev" });
    expect(
      summarizeOptions(
        [
          { quantity: 1, unitPriceMinor: 0, unitFeeMinor: 0, redeemed: 1, option: option("Badge") },
          { quantity: 2, unitPriceMinor: 0, unitFeeMinor: 0, redeemed: 0, option: option("Affiche") },
        ],
        new Map(),
      ).rows.map((r) => [r.name, r.eventTitle, r.sold]),
    ).toEqual([
      ["Affiche", "", 2],
      ["Badge", "", 1],
    ]); // à montant égal : ordre alphabétique ; événement inconnu : vide
  });

  it("facture mensuelle : la commission des options apparaît « dont options », déjà comprise dans le total facturé ; numérotation et total inchangés (RG-OPT-08)", async () => {
    const { org, ctx } = await organisation();
    const bal = await evenement(org.id, "Bal");
    const jeton = await createOption(ctx, bal.id, { name: "Jeton boisson", price: "3" });
    const c = await achat(bal, [{ optionId: jeton.id, quantity: 5 }]);
    const now = new Date();
    const moisDernier = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 15, 12));
    await db.order.update({ where: { id: c }, data: { paidAt: moisDernier } });
    const commande = await db.order.findUniqueOrThrow({ where: { id: c } });
    const periode = `${moisDernier.getUTCFullYear()}-${String(moisDernier.getUTCMonth() + 1).padStart(2, "0")}`;
    const facture = await issueStatement(org.id, periode, "EUR");
    expect(facture.feesMinor).toBe(commande.applicationFeeMinor); // la facture inclut déjà la commission des options
    const options = await statementOptionsFee(org.id, facture.periodStart, facture.periodEnd, "EUR");
    expect(options).toBe(5 * 6); // 5 jetons à 3 € : 2 % = 0,06 € chacun
    expect(commande.applicationFeeMinor).toBeGreaterThan(options); // commission du billet en plus
    const pdf = await statementPdf(facture.id);
    expect(pdf.number).toBe(facture.number);
    expect((await PDFDocument.load(pdf.bytes)).getPageCount()).toBe(1);
    // la facture est figée : la réémettre rend la même, avec le même numéro et le même total
    expect(await issueStatement(org.id, periode, "EUR")).toMatchObject({ id: facture.id, number: facture.number, totalMinor: facture.totalMinor });
    // autre devise ou autre période : aucune option
    expect(await statementOptionsFee(org.id, facture.periodStart, facture.periodEnd, "USD")).toBe(0);
    expect(await statementOptionsFee(org.id, facture.periodEnd, new Date(facture.periodEnd.getTime() + 31 * DAY), "EUR")).toBe(0);
  });
});
