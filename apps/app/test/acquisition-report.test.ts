import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { acquisitionFunnel, offlineConversions } from "@/server/acquisitionReport";
import { createOrganization } from "@/server/onboarding";

const rid = () => Math.random().toString(36).slice(2, 8);
async function org(acquisition: Record<string, string> | null) {
  const u = await db.user.create({ data: { name: "Nora", email: `acq.${rid()}@exemple.be`, emailVerified: true } });
  const o = await createOrganization(u.id, { name: `Club ${rid()}`, subdomain: `club-${rid()}`, country: "BE", type: "ASSOCIATION" } as never);
  if (acquisition) await db.organization.update({ where: { id: o.id }, data: { acquisition } });
  return o;
}

describe("rapport d'acquisition de l'administration", () => {
  it("entonnoir par source : organisations, publication, première vente, Pro ; conversions Google Ads : celles avec un identifiant de clic", async () => {
    await db.promotion.updateMany({ data: { active: false } }); // les organisations naissent en Free
    const since = new Date(Date.now() - 1000);
    const campaign = `lancement-${rid()}`;
    const gclid = `Cj0K-${rid()}`;
    const visit = { source: "google", medium: "cpc", campaign, landing: "/start", firstAt: new Date().toISOString() };
    const a = await org({ ...visit, gclid });
    const b = await org(visit);
    const c = await org(null);
    const e = await db.event.create({
      data: {
        organizationId: a.id,
        slug: `e-${rid()}`,
        publicCode: rid().toUpperCase(),
        title: "Gala",
        currency: "EUR",
        timezone: "Europe/Brussels",
        startsAt: new Date(Date.now() + 30 * 86_400_000),
        status: "PUBLISHED",
      },
    });
    const tt = await db.ticketType.create({ data: { eventId: e.id, name: "Normal", priceMinor: 1000, currency: "EUR" } });
    await db.order.create({
      data: {
        reference: `EVO-${rid()}`,
        organizationId: a.id,
        eventId: e.id,
        buyerEmail: "lea@exemple.be",
        buyerFirstName: "Léa",
        buyerLastName: "Martin",
        currency: "EUR",
        subtotalMinor: 1000,
        totalMinor: 1000,
        status: "PAID",
        paidAt: new Date(),
        feeSnapshot: {},
        accessTokenHash: rid(),
        items: { create: [{ ticketTypeId: tt.id, quantity: 1, unitPriceMinor: 1000 }] },
      },
    });
    await db.subscription.update({ where: { organizationId: a.id }, data: { planId: "pro", status: "ACTIVE" } });

    const { rows, detail } = await acquisitionFunnel(since);
    expect(rows.find((r) => r.campaign === campaign)).toEqual({
      source: "google",
      medium: "cpc",
      campaign,
      organizations: 2,
      published: 1,
      firstSale: 1,
      pro: 1,
    });
    const mine = detail.filter((d) => [a.id, b.id, c.id].includes(d.id));
    expect(mine.find((d) => d.id === c.id)).toMatchObject({
      source: "inconnue",
      medium: "-",
      campaign: "-",
      published: false,
      firstSaleAt: null,
      pro: false,
      gclid: null,
    });
    expect(mine.find((d) => d.id === a.id)).toMatchObject({ published: true, pro: true, gclid });

    const conversions = (await offlineConversions(since)).filter((x) => x.gclid === gclid);
    expect(conversions.map((x) => x.name)).toEqual(["Organisation créée", "Premier billet vendu"]);
  });
});
