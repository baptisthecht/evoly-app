import { blocksToEmailDoc } from "@evoly/core";
import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { eventMarketingAutomations, runDueMarketingAutomations, saveMarketingAutomation } from "@/server/automations";
import { archiveTemplate, campaignAudience, listTemplates, saveTemplate } from "@/server/campaigns";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import type { OrgContext } from "@/server/context";
import { getPlans } from "@/server/plans";

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;

async function setup() {
  const id = rid();
  const user = await db.user.create({ data: { name: "Camille", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  await db.subscription.create({ data: { organizationId: org.id, planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 60 * DAY) } });
  const mk = (slug: string, days: number, quantities: number[] = [50]) =>
    db.event.create({
      data: {
        organizationId: org.id,
        slug: `${slug}-${id}`,
        publicCode: `${slug.slice(0, 2)}${id}`.toUpperCase().slice(0, 8) /* 6 caractères aléatoires : pas de collision entre les exécutions */,
        title: `${slug} ${id}`,
        currency: "EUR",
        timezone: "Europe/Brussels",
        startsAt: new Date(Date.now() + days * DAY),
        status: "PUBLISHED",
        visibility: "PUBLIC",
        ticketTypes: { create: quantities.map((q, i) => ({ name: i ? "VIP" : "Entrée", priceMinor: 0, currency: "EUR", quantity: q, sortOrder: i })) },
      },
      include: { ticketTypes: { orderBy: { sortOrder: "asc" } } },
    });
  const buy = async (event: Awaited<ReturnType<typeof mk>>, who: string, consent: boolean, typeIndex = 0) => {
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[typeIndex]!.id, quantity: 1 }], locale: "fr" });
    await submitBuyer(r.token, { firstName: who, lastName: "Test", email: `${who.toLowerCase()}.${id}@exemple.be`, marketingOptIn: consent });
    return `${who.toLowerCase()}.${id}@exemple.be`;
  };
  const ctx = {
    organization: { id: org.id, slug: org.slug, locale: "fr", timezone: "Europe/Brussels" },
    user: { id: user.id },
    features: (await getPlans()).pro.features,
  } as unknown as OrgContext;
  return { id, org, ctx, mk, buy };
}
const sentTo = async (automationId: string) => await db.emailMessage.findMany({ where: { automationId }, select: { toEmail: true, id: true } });

describe("e-mails marketing automatiques (US-MKT-02, section 9.18)", () => {
  it("désactivés par défaut ; remerciement 2 heures après la fin, consentants seulement, avec la prochaine date, une seule fois", async () => {
    const s = await setup();
    const past = await s.mk("concert", 2);
    const next = await s.mk("suite", 30);
    const anna = await s.buy(past, "Anna", true);
    await s.buy(past, "Bruno", false);
    const rows = await eventMarketingAutomations(past.id);
    expect(rows.map((r) => [r.type, r.enabled])).toEqual([
      ["POST_EVENT", false],
      ["LAST_TICKETS", false],
    ]);
    const end = new Date(Date.now() - 3 * 3_600_000);
    await db.event.update({ where: { id: past.id }, data: { startsAt: new Date(end.getTime() - 3 * 3_600_000), endsAt: end } });
    await runDueMarketingAutomations();
    expect(await db.emailMessage.count({ where: { organizationId: s.org.id, template: "automation.marketing" } })).toBe(0);
    await saveMarketingAutomation(s.ctx, past.id, "POST_EVENT", {
      enabled: true,
      subject: "Merci {{prenom}} !",
      content: blocksToEmailDoc([{ type: "text", text: "Bonjour {{prenom}},\nMerci d'être venue." }]),
    });
    await runDueMarketingAutomations();
    await runDueMarketingAutomations();
    const a = (await eventMarketingAutomations(past.id)).find((r) => r.type === "POST_EVENT")!;
    const mails = await sentTo(a.id);
    expect(mails.map((m) => m.toEmail)).toEqual([anna]);
    expect(a.lastRunAt).not.toBeNull();
    const msg = await db.emailMessage.findUniqueOrThrow({ where: { id: mails[0]!.id } });
    expect(msg.subject).toBe("Merci Anna !");
    const dir = process.env.EMAIL_OUTBOX_DIR!;
    const file = (await readdir(dir)).find((f) => f.includes(msg.id) && f.endsWith(".json"))!;
    expect(JSON.parse(await readFile(`${dir}/${file}`, "utf8")).html).toContain(next.title);
  });

  it("dernières places : sous 10 % de la jauge, aux consentants sans billet pour l'événement", async () => {
    const s = await setup();
    const hot = await s.mk("gala", 10, [20]);
    const other = await s.mk("bal", 12);
    const clara = await s.buy(other, "Clara", true);
    const dan = await s.buy(hot, "Dan", true);
    await saveMarketingAutomation(s.ctx, hot.id, "LAST_TICKETS", {
      enabled: true,
      subject: "Dernières places",
      content: blocksToEmailDoc([{ type: "text", text: "Il reste quelques places." }]),
    });
    await runDueMarketingAutomations();
    const a = (await eventMarketingAutomations(hot.id)).find((r) => r.type === "LAST_TICKETS")!;
    expect(await sentTo(a.id)).toHaveLength(0); // 1 place vendue sur 20
    await db.ticketType.update({ where: { id: hot.ticketTypes[0]!.id }, data: { quantitySold: 19 } });
    await runDueMarketingAutomations();
    await runDueMarketingAutomations();
    const mails = await sentTo(a.id);
    expect(mails.map((m) => m.toEmail)).toEqual([clara]);
    expect(mails.map((m) => m.toEmail)).not.toContain(dan);
  });

  it("destinataires par tarif ; modèles personnels enregistrés puis archivés", async () => {
    const s = await setup();
    const e = await s.mk("fete", 8, [50, 10]);
    await s.buy(e, "Eva", true, 0);
    const vip = await s.buy(e, "Victor", true, 1);
    const audience = await campaignAudience(s.org.id, { kind: "EVENTS", eventIds: [e.id], ticketTypeIds: [e.ticketTypes[1]!.id], attendance: "ANY" });
    expect(audience.map((c) => c.email)).toEqual([vip]);
    const tpl = await saveTemplate(s.ctx, {
      name: "Annonce maison",
      subject: "{{prenom}}, du nouveau",
      content: blocksToEmailDoc([{ type: "heading", text: "Du nouveau" }]),
    });
    expect((await listTemplates(s.ctx)).map((t) => t.name)).toEqual(["Annonce maison"]);
    await archiveTemplate(s.ctx, tpl.id);
    expect(await listTemplates(s.ctx)).toHaveLength(0);
  });
});
