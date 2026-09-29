import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined), set: (k: string, v: string) => void jar.set(k, v), delete: (k: string) => void jar.delete(k) }) }));

const { db } = await import("@/lib/db");
const { reserveOrder, submitBuyer } = await import("@/server/checkout");
const { openParticipantSession, participantEmail, participantOverview, requestParticipantLink, setMarketingPreference } = await import("@/server/participant");

const rid = () => Math.random().toString(36).slice(2, 10);
const outbox = async (to: string, template: string) => {
  const dir = process.env.EMAIL_OUTBOX_DIR!;
  for (const f of (await readdir(dir)).filter((x) => x.endsWith(".json")).sort().reverse()) {
    const m = JSON.parse(await readFile(`${dir}/${f}`, "utf8"));
    if (m.to === to && m.template === template) return m as { text: string };
  }
  return null;
};

describe("espace participant (section 9.23)", () => {
  it("lien de connexion sans fuite, session signée, billets à venir et passés, préférences d'e-mails", async () => {
    jar.clear();
    const id = rid();
    const email = `lea.${id}@exemple.be`;
    const org = await db.organization.create({ data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" } });
    const mk = (slug: string, days: number) => db.event.create({ data: { organizationId: org.id, slug: `${slug}-${id}`, publicCode: `${slug}${id}`.toUpperCase().slice(0, 8), title: `${slug} ${id}`, currency: "EUR", timezone: "Europe/Brussels", startsAt: new Date(Date.now() + days * 86_400_000), status: "PUBLISHED", ticketTypes: { create: { name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 20 } } }, include: { ticketTypes: true } });
    for (const e of [await mk("gala", 10), await mk("bal", 12)]) {
      const r = await reserveOrder({ eventId: e.id, lines: [{ ticketTypeId: e.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" });
      await submitBuyer(r.token, { firstName: "Léa", lastName: "Martin", email, marketingOptIn: e.slug.startsWith("gala") });
    }
    await db.event.updateMany({ where: { slug: `bal-${id}` }, data: { startsAt: new Date(Date.now() - 5 * 86_400_000) } });

    await requestParticipantLink(`nobody.${id}@exemple.be`, "10.0.0.1", "fr");
    expect(await outbox(`nobody.${id}@exemple.be`, "participant.magic_link")).toBeNull(); // aucune fuite : rien n'est envoyé
    await requestParticipantLink(email.toUpperCase(), "10.0.0.1", "fr");
    const mail = (await outbox(email, "participant.magic_link"))!;
    const token = /\/mon-espace\/connexion\/(\S+)/.exec(mail.text)![1]!;
    expect(await openParticipantSession(`${token}x`)).toBe(false);
    expect(await openParticipantSession(token)).toBe(true);
    expect(await participantEmail()).toBe(email);

    const data = await participantOverview(email);
    expect(data.upcoming.map((o) => o.title)).toEqual([`gala ${id}`]);
    expect(data.past.map((o) => o.title)).toEqual([`bal ${id}`]);
    expect(data.upcoming[0]!.url).toContain("/billets/");
    expect(data.preferences).toEqual([{ organizationId: org.id, organization: `Club ${id}`, marketing: true }]);

    await setMarketingPreference(email, org.id, false);
    expect((await participantOverview(email)).preferences[0]!.marketing).toBe(false);
    await db.emailSuppression.create({ data: { email, scope: "ORGANIZATION", organizationId: org.id, eventId: null, reason: "HARD_BOUNCE" } }).catch(() => undefined);
    await setMarketingPreference(email, org.id, true);
    expect((await participantOverview(email)).preferences[0]!.marketing).toBe(true);
    expect(await db.emailSuppression.count({ where: { email, organizationId: org.id, reason: "UNSUBSCRIBED" } })).toBe(0);
  });
});
