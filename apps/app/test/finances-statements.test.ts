import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { finalizeOrder, reserveOrder } from "@/server/checkout";
import { findOrgContext } from "@/server/context";
import { issuePreviousMonthStatements, periodRange, statementMonths } from "@/server/finances";

const DAY = 86_400_000;
const rid = () => Math.random().toString(36).slice(2, 10);

describe("périodes des finances (section 9.16)", () => {
  const tz = "Europe/Brussels";
  const now = new Date("2027-01-15T10:00:00Z");
  it("en heure de Bruxelles, y compris au changement d'année", () => {
    expect(periodRange("THIS_MONTH", tz, now)).toEqual({ from: new Date("2026-12-31T23:00:00Z"), to: null });
    expect(periodRange("LAST_MONTH", tz, now)).toEqual({ from: new Date("2026-11-30T23:00:00Z"), to: new Date("2026-12-31T23:00:00Z") });
    expect(periodRange("THIS_YEAR", tz, now)).toEqual({ from: new Date("2026-12-31T23:00:00Z"), to: null });
    expect(periodRange("LAST_30_DAYS", tz, now).from).toEqual(new Date(now.getTime() - 30 * DAY));
  });
});

describe("relevés mensuels de commissions (RG-FIN-02)", () => {
  it("commissions du mois additionnées ; relevé du mois précédent émis le mois suivant, une seule fois", async () => {
    const id = rid();
    const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
    const org = await db.organization.create({
      data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
    });
    const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
    await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
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
        ticketTypes: { create: { name: "Entrée", priceMinor: 1000, currency: "EUR", quantity: 50 } },
      },
      include: { ticketTypes: true },
    });
    const fees: number[] = [];
    for (let i = 0; i < 2; i++) {
      const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" });
      await db.order.update({ where: { id: r.orderId }, data: { buyerEmail: `c.${rid()}@exemple.be`, buyerFirstName: "Alex", buyerLastName: "Martin" } });
      expect(await finalizeOrder(r.orderId)).toBe("PAID");
      fees.push((await db.order.findUniqueOrThrow({ where: { id: r.orderId } })).applicationFeeMinor);
    }
    const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
    const months = await statementMonths(ctx);
    const period = new Date().toISOString().slice(0, 7);
    expect(months).toEqual(expect.arrayContaining([expect.objectContaining({ period, currency: "EUR", feesMinor: fees[0]! + fees[1]! })]));
    // le mois suivant, la tâche mensuelle émet le relevé du mois écoulé, une seule fois même lancée deux fois
    const [y, m] = [Number(period.slice(0, 4)), Number(period.slice(5, 7))];
    const nextMonth = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 2, 9, 0));
    expect(await issuePreviousMonthStatements(nextMonth)).toBeGreaterThanOrEqual(1);
    await issuePreviousMonthStatements(nextMonth);
    const releves = await db.commissionStatement.findMany({ where: { organizationId: org.id } });
    expect(releves).toHaveLength(1); // relevé numéroté, émis une seule fois
    expect(releves[0]).toMatchObject({ currency: "EUR", ticketsCount: 2, feesMinor: fees[0]! + fees[1]! });
    expect(releves[0]!.number).toBeTruthy();
  });
});
