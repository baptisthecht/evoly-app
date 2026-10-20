import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { POST } from "@/app/api/v/[eventId]/route";
import { eventOverview } from "@/server/eventOverview";
import { createOrganization } from "@/server/onboarding";

const rid = () => Math.random().toString(36).slice(2, 8);
const BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
async function event(status: "PUBLISHED" | "DRAFT" = "PUBLISHED") {
  const u = await db.user.create({ data: { name: "Nora", email: `vues.${rid()}@exemple.be`, emailVerified: true } });
  const org = await createOrganization(u.id, { name: "Club", subdomain: `club-${rid()}`, country: "BE", type: "ASSOCIATION" } as never);
  return db.event.create({
    data: {
      organizationId: org.id,
      slug: `e-${rid()}`,
      publicCode: rid().toUpperCase(),
      title: "Gala",
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 30 * 86_400_000),
      status,
    },
  });
}
const visit = (eventId: string, ua = BROWSER, ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.1`) =>
  POST(new Request(`https://club.evoly.me/api/v/${eventId}`, { method: "POST", headers: { "user-agent": ua, "x-forwarded-for": ip } }), {
    params: Promise.resolve({ eventId }),
  });
const views = async (eventId: string) => (await db.eventDailyStat.aggregate({ where: { eventId }, _sum: { pageViews: true } }))._sum.pageViews ?? 0;

describe("visites des billetteries : comptage anonyme, sans cookie", () => {
  it("une visite, puis une autre : comptées ; réponse vide dans tous les cas", async () => {
    const e = await event();
    const res = await visit(e.id);
    await visit(e.id);
    expect([res.status, await views(e.id)]).toEqual([204, 2]);
  });

  it("robots et navigateurs sans fenêtre (nos parcours de test) : jamais comptés", async () => {
    const e = await event();
    for (const ua of [
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
      "facebookexternalhit/1.1",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0 Safari/537.36",
      "curl/8.5.0",
    ])
      await visit(e.id, ua);
    expect(await views(e.id)).toBe(0);
  });

  it("brouillon ou identifiant invalide : rien n'est compté", async () => {
    const draft = await event("DRAFT");
    await visit(draft.id);
    expect(await views(draft.id)).toBe(0);
    expect((await visit("pas-un-identifiant")).status).toBe(204);
  });

  it("un même visiteur : 20 visites par demi-heure au plus", async () => {
    const e = await event();
    for (let i = 0; i < 25; i++) await visit(e.id, BROWSER, "10.9.9.9");
    expect(await views(e.id)).toBe(20);
  });

  it("vue d'ensemble : total des visites et part qui achète", async () => {
    const e = await event();
    await db.eventDailyStat.create({ data: { eventId: e.id, date: new Date(Date.UTC(2026, 9, 1)), pageViews: 40 } });
    const o = await eventOverview(e.id, "Europe/Brussels", "14");
    expect([o.views, o.conversionPct, o.ordersCount]).toEqual([40, 0, 0]);
    const none = await event();
    expect((await eventOverview(none.id, "Europe/Brussels", "14")).conversionPct).toBeNull();
  });
});
