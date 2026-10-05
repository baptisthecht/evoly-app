import { describe, expect, it } from "vitest";
import { utcToZonedLocal, vatIncluded } from "@evoly/core";
import { db } from "@/lib/db";
import { finalizeOrder, reserveOrder } from "@/server/checkout";
import type { OrgContext } from "@/server/context";
import { financeOverview, issueStatement, ordersCsv, statementPdf } from "@/server/finances";

const rid = () => Math.random().toString(36).slice(2, 10);
const TZ = "Europe/Brussels";

/** Organisation belge, propriétaire, événement payant et deux commandes payées (paiement simulé). */
async function setup() {
  const id = rid();
  const user = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: {
      name: `Asso ${id}`,
      slug: `asso-${id}`,
      subdomain: `asso-${id}`,
      country: "BE",
      currency: "EUR",
      timezone: TZ,
      locale: "fr",
      legalName: `Asso ${id} ASBL`,
      vatNumber: "BE0123456789",
      vatRegistered: true,
    },
  });
  const owner = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: user.id, roleId: owner.id, status: "ACTIVE" } });
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Gala ${id}`,
      currency: "EUR",
      timezone: TZ,
      startsAt: new Date(Date.now() + 10 * 86_400_000),
      status: "PUBLISHED",
      ticketTypes: { create: { name: "Entrée", priceMinor: 2400, currency: "EUR", quantity: 100 } },
    },
    include: { ticketTypes: true },
  });
  const orders: string[] = [];
  for (const qty of [2, 1]) {
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: qty }], locale: "fr" });
    await db.order.update({ where: { id: r.orderId }, data: { buyerFirstName: "Léa", buyerLastName: "Martin", buyerEmail: `lea.${id}@exemple.be` } });
    await finalizeOrder(r.orderId, {
      paymentIntentId: `pi_${id}_${qty}`,
      amountMinor: 2400 * qty,
      currency: "eur",
      chargeId: `ch_${id}_${qty}`,
      paymentMethodType: "card",
    });
    orders.push(r.orderId);
  }
  // la seconde commande date du mois précédent
  const local = utcToZonedLocal(new Date(), TZ);
  const lastMonth = new Date(Date.UTC(Number(local.slice(0, 4)), Number(local.slice(5, 7)) - 1, 1) - 5 * 86_400_000);
  await db.order.update({ where: { id: orders[1]! }, data: { paidAt: lastMonth } });
  const ctx = { organization: { id: org.id, timezone: TZ, currency: "EUR", slug: org.slug }, user: { id: user.id } } as unknown as OrgContext;
  const period = utcToZonedLocal(lastMonth, TZ).slice(0, 7);
  return { id, org, ctx, orders, period, current: local.slice(0, 7) };
}

describe("finances (section 9.16)", () => {
  it("totaux sur toute la période : brut, commissions, frais estimés, net", async () => {
    const s = await setup();
    const o = await financeOverview(s.ctx, { period: "ALL" });
    const fees = await db.order.findMany({ where: { id: { in: s.orders } }, select: { applicationFeeMinor: true } });
    expect(o.totals).toMatchObject({
      orders: 2,
      tickets: 3,
      grossMinor: 7200,
      refundedMinor: 0,
      commissionMinor: fees.reduce((n, f) => n + f.applicationFeeMinor, 0),
      bankFeeEstimated: true,
    });
    expect(o.byEvent).toHaveLength(1);
    expect((await financeOverview(s.ctx, { period: "THIS_MONTH" })).totals.orders).toBe(1);
  });

  it("relevé mensuel : mois en cours refusé, émis une fois, TVA belge, numéro séquentiel, PDF envoyé au propriétaire", async () => {
    const s = await setup();
    await expect(issueStatement(s.org.id, s.current, "EUR")).rejects.toThrow("STATEMENT_PERIOD_OPEN");
    const fee = (await db.order.findUniqueOrThrow({ where: { id: s.orders[1]! } })).applicationFeeMinor;
    const st = await issueStatement(s.org.id, s.period, "EUR");
    expect(st).toMatchObject({
      status: "ISSUED",
      feesMinor: fee,
      totalMinor: fee,
      ticketsCount: 1,
      vatRateBps: 2100,
      vatMinor: vatIncluded(fee, 2100),
      vatMention: "BE_VAT",
    });
    expect(st.number).toMatch(/^EVO-\d{4}-\d{6}$/);
    expect((await issueStatement(s.org.id, s.period, "EUR")).id).toBe(st.id);
    const other = await setup();
    const st2 = await issueStatement(other.org.id, other.period, "EUR");
    expect(Number(st2.number.slice(-6))).toBeGreaterThan(Number(st.number.slice(-6)));
    const { bytes } = await statementPdf(st.id);
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe("%PDF-");
    expect(await db.emailMessage.count({ where: { organizationId: s.org.id, template: "finance.statement" } })).toBe(1);
    const empty = `${Number(s.period.slice(0, 4)) - 1}-01`;
    await expect(issueStatement(s.org.id, empty, "EUR")).rejects.toThrow("STATEMENT_EMPTY");
  });

  it("export CSV des commandes : séparateur point-virgule, virgule décimale", async () => {
    const s = await setup();
    const csv = await ordersCsv(s.ctx, { period: "ALL" });
    const reference = (await db.order.findUniqueOrThrow({ where: { id: s.orders[0]! } })).reference;
    expect(csv.startsWith("\ufeffRéférence;Date;Événement")).toBe(true);
    expect(csv).toContain(`${reference};`);
    expect(csv).toContain(";48,00;0,00;");
  });
});
