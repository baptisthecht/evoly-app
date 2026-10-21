import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { automationDoc, eventMarketingAutomations, eventReminders, saveMarketingAutomation, setReminderEnabled } from "@/server/automations";
import { findOrgContext } from "@/server/context";

// automatisations (section 9.18, US-MKT-01) : rappels avant l'événement et e-mails marketing automatiques
const rid = () => Math.random().toString(36).slice(2, 10);
async function setup(o: { pro?: boolean } = {}) {
  const id = rid();
  const owner = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({
    data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr" },
  });
  const ownerRole = await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } });
  await db.organizationMember.create({ data: { organizationId: org.id, userId: owner.id, roleId: ownerRole.id, status: "ACTIVE" } });
  if (o.pro !== false)
    await db.subscription.create({
      data: { organizationId: org.id, planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 60 * 86_400_000) },
    });
  const ctx = { ...(await findOrgContext(owner.id, org.slug))!, user: { id: owner.id, name: owner.name ?? "", email: owner.email } };
  const event = await db.event.create({
    data: {
      organizationId: org.id,
      slug: `gala-${id}`,
      publicCode: id.toUpperCase().slice(0, 8),
      title: `Gala ${id}`,
      currency: "EUR",
      timezone: "Europe/Brussels",
      startsAt: new Date(Date.now() + 30 * 86_400_000),
      status: "PUBLISHED",
    },
  });
  return { ctx, org, event };
}
const refused = (code: string) => expect.objectContaining({ code });
const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Merci d'être venus !" }] }] };

describe("rappels avant l'événement", () => {
  it("trois rappels créés et activés par défaut, sans doublon ; offre gratuite refusée ; autre organisateur introuvable ; désactivation inscrite", async () => {
    const { ctx, org, event } = await setup();
    const first = await eventReminders(event.id);
    // dans l'ordre de déclaration : une semaine, la veille, le jour même
    expect(first.map((r) => [r.type, r.enabled])).toEqual([
      ["REMINDER_J7", true],
      ["REMINDER_J1", true],
      ["REMINDER_J0", true],
    ]);
    expect(await eventReminders(event.id)).toHaveLength(3);
    const free = await setup({ pro: false });
    await expect(setReminderEnabled(free.ctx, free.event.id, "REMINDER_J1", false)).rejects.toEqual(refused("PRO_REQUIRED"));
    const other = await setup();
    await expect(setReminderEnabled(ctx, other.event.id, "REMINDER_J1", false)).rejects.toEqual(refused("NOT_FOUND"));
    await setReminderEnabled(ctx, event.id, "REMINDER_J1", false);
    expect((await db.emailAutomation.findUniqueOrThrow({ where: { eventId_type: { eventId: event.id, type: "REMINDER_J1" } } })).enabled).toBe(false);
    expect(await db.auditLog.count({ where: { organizationId: org.id, action: "automation.toggled" } })).toBe(1);
  });
});

describe("e-mails marketing automatiques", () => {
  it("créés désactivés avec un sujet par défaut ; offre gratuite ou contenu vide refusés ; enregistrés avec le sujet nettoyé", async () => {
    const { ctx, org, event } = await setup();
    const list = await eventMarketingAutomations(event.id);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((a) => a.enabled === false && a.subject.length > 0)).toBe(true);
    const type = list[0]!.type as never;
    const free = await setup({ pro: false });
    await expect(saveMarketingAutomation(free.ctx, free.event.id, type, { enabled: true, subject: "Merci", content: doc })).rejects.toEqual(
      refused("PRO_REQUIRED"),
    );
    await expect(saveMarketingAutomation(ctx, event.id, type, { enabled: true, subject: "Merci", content: { type: "doc", content: [] } })).rejects.toEqual(
      refused("CAMPAIGN_CONTENT_INVALID"),
    );
    const other = await setup();
    await expect(saveMarketingAutomation(ctx, other.event.id, type, { enabled: true, subject: "Merci", content: doc })).rejects.toEqual(refused("NOT_FOUND"));
    await saveMarketingAutomation(ctx, event.id, type, { enabled: true, subject: "  Merci pour la soirée  ", content: doc });
    expect(await db.emailAutomation.findUniqueOrThrow({ where: { eventId_type: { eventId: event.id, type } } })).toMatchObject({
      enabled: true,
      subject: "Merci pour la soirée",
    });
    expect(await db.auditLog.count({ where: { organizationId: org.id, action: "automation.saved" } })).toBe(1);
  });

  it("contenu : ancien message texte converti ; à défaut, texte de repli", () => {
    expect(JSON.stringify(automationDoc({ message: "À bientôt au prochain gala" }))).toContain("À bientôt au prochain gala");
    expect(JSON.stringify(automationDoc(null, "Texte de repli"))).toContain("Texte de repli");
    expect(JSON.stringify(automationDoc(doc))).toContain("Merci d'être venus !");
  });
});
