import { createHmac, randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { campaignAudience, processCampaigns, saveCampaign, scheduleCampaign, unscheduleCampaign } from "@/server/campaigns";
import { reserveOrder, submitBuyer } from "@/server/checkout";
import type { OrgContext } from "@/server/context";
import { applyResendEvent, verifyResendSignature } from "@/server/emailEvents";
import { getPlans } from "@/server/plans";
import { cancelEvent } from "@/server/refunds";
import { applyUnsubscribe, unsubscribeToken } from "@/server/unsubscribe";

const rid = () => Math.random().toString(36).slice(2, 10);
const DAY = 86_400_000;
const BLOCKS = [{ type: "heading", text: "Bonjour {{prenom}}" }, { type: "text", text: "Notre prochaine date arrive." }];

async function setup(plan: "free" | "pro" = "pro") {
  const id = rid();
  const user = await db.user.create({ data: { name: "Camille Dupont", email: `own.${id}@exemple.be`, emailVerified: true } });
  const org = await db.organization.create({ data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR", timezone: "Europe/Brussels", locale: "fr", addressLine1: "Rue Haute 1", postalCode: "1000", city: "Bruxelles" } });
  if (plan === "pro") await db.subscription.create({ data: { organizationId: org.id, planId: "pro", status: "ACTIVE", currentPeriodEnd: new Date(Date.now() + 60 * DAY) } });
  const mk = (slug: string) => db.event.create({ data: { organizationId: org.id, slug: `${slug}-${id}`, publicCode: `${slug}${id}`.toUpperCase().slice(0, 8), title: `${slug} ${id}`, currency: "EUR", timezone: "Europe/Brussels", startsAt: new Date(Date.now() + 20 * DAY), status: "PUBLISHED", ticketTypes: { create: { name: "Entrée", priceMinor: 0, currency: "EUR", quantity: 50 } } }, include: { ticketTypes: true } });
  const [e1, e2] = [await mk("bal"), await mk("gala")];
  const buy = async (event: typeof e1, name: string, consent: boolean) => {
    const r = await reserveOrder({ eventId: event.id, lines: [{ ticketTypeId: event.ticketTypes[0]!.id, quantity: 1 }], locale: "fr" });
    await submitBuyer(r.token, { firstName: name, lastName: "Test", email: `${name.toLowerCase()}.${id}@exemple.be`, marketingOptIn: consent });
    return { email: `${name.toLowerCase()}.${id}@exemple.be`, orderId: r.orderId };
  };
  const a = await buy(e1, "Anna", true);
  const b = await buy(e1, "Bruno", true);
  await buy(e1, "Chloe", false);
  const d = await buy(e1, "David", true);
  const e = await buy(e1, "Emma", true);
  const f = await buy(e2, "Farid", true);
  await db.ticket.updateMany({ where: { orderId: a.orderId }, data: { status: "CHECKED_IN", checkedInAt: new Date() } });
  await applyUnsubscribe(unsubscribeToken(d.email, org.id), "ORGANIZATION");
  await db.emailSuppression.create({ data: { email: e.email, scope: "ORGANIZATION", organizationId: org.id, reason: "HARD_BOUNCE" } });
  const ctx = { organization: { id: org.id, slug: org.slug, locale: "fr", timezone: "Europe/Brussels" }, user: { id: user.id }, features: (await getPlans())[plan].features } as unknown as OrgContext;
  return { id, org, ctx, e1, e2, a, b, f };
}
const emails = async (organizationId: string, template = "campaign") => (await db.emailMessage.findMany({ where: { organizationId, template }, select: { toEmail: true } })).map((m) => m.toEmail).sort();

describe("campagnes (US-MKT-03, RG-MKT-01 à 07)", () => {
  it("destinataires : consentants, sans désinscrits ni adresses bloquées, par événement et présence", async () => {
    const s = await setup();
    const all = (seg: object) => campaignAudience(s.org.id, seg as never).then((r) => r.map((c) => c.email).sort());
    expect(await all({ kind: "ALL_CONSENTING" })).toEqual([s.a.email, s.b.email, s.f.email].sort());
    expect(await all({ kind: "EVENTS", eventIds: [s.e1.id], attendance: "ANY" })).toEqual([s.a.email, s.b.email].sort());
    expect(await all({ kind: "EVENTS", eventIds: [s.e1.id], attendance: "PRESENT" })).toEqual([s.a.email]);
    expect(await all({ kind: "EVENTS", eventIds: [s.e1.id], attendance: "ABSENT" })).toEqual([s.b.email]);
  });

  it("réservé au Pro ; contenu vérifié ; jamais sans destinataire ; délais de programmation", async () => {
    const free = await setup("free");
    await expect(saveCampaign(free.ctx, { name: "Test", subject: "Test", blocks: BLOCKS, segment: { kind: "ALL_CONSENTING" } })).rejects.toThrow("PRO_REQUIRED");
    const s = await setup();
    await expect(saveCampaign(s.ctx, { name: "Test", subject: "Test", blocks: [{ type: "button", label: "x", url: "javascript:alert(1)" }], segment: { kind: "ALL_CONSENTING" } })).rejects.toThrow("CAMPAIGN_CONTENT_INVALID");
    const empty = await saveCampaign(s.ctx, { name: "Vide", subject: "Vide", blocks: BLOCKS, segment: { kind: "ALL_CONSENTING", locale: "en" } });
    await expect(scheduleCampaign(s.ctx, empty.id, null)).rejects.toThrow("CAMPAIGN_NO_RECIPIENTS");
    const c = await saveCampaign(s.ctx, { name: "Printemps", subject: "{{prenom}}, le printemps arrive", blocks: BLOCKS, segment: { kind: "ALL_CONSENTING" } });
    await expect(scheduleCampaign(s.ctx, c.id, new Date(Date.now() + 60_000))).rejects.toThrow("CAMPAIGN_SCHEDULE_TOO_SOON");
    const at = new Date(Date.now() + 20 * 60_000);
    await scheduleCampaign(s.ctx, c.id, at);
    await expect(saveCampaign(s.ctx, { id: c.id, name: "Printemps", subject: "Autre", blocks: BLOCKS, segment: { kind: "ALL_CONSENTING" } })).rejects.toThrow("CAMPAIGN_TOO_LATE");
    await unscheduleCampaign(s.ctx, c.id);
    expect((await db.emailCampaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("DRAFT");
  });

  it("envoi : une fois par contact, prénom et pied de page, plafond quotidien respecté, puis verrouillée", async () => {
    const s = await setup();
    await db.organization.update({ where: { id: s.org.id }, data: { marketingDailyCap: 2 } });
    const c = await saveCampaign(s.ctx, { name: "Printemps", subject: "{{prenom}}, le printemps arrive", blocks: BLOCKS, segment: { kind: "ALL_CONSENTING" } });
    await scheduleCampaign(s.ctx, c.id, null);
    await processCampaigns(new Date());
    expect(await db.emailMessage.count({ where: { campaignId: c.id } })).toBe(2);
    expect((await db.emailCampaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("SENDING");
    await processCampaigns(new Date(Date.now() + DAY));
    await processCampaigns(new Date(Date.now() + DAY + 60_000));
    expect(await emails(s.org.id)).toEqual([s.a.email, s.b.email, s.f.email].sort());
    expect(await db.emailCampaign.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ status: "SENT", recipientCount: 3 });
    const msg = await db.emailMessage.findFirstOrThrow({ where: { campaignId: c.id, toEmail: s.a.email } });
    expect(msg.subject).toBe("Anna, le printemps arrive");
    const dir = process.env.EMAIL_OUTBOX_DIR!;
    const file = (await readdir(dir)).find((f) => f.includes(msg.id) && f.endsWith(".json"))!;
    const out = JSON.parse(await readFile(`${dir}/${file}`, "utf8")) as { html: string; headers?: Record<string, string> };
    expect(out.html).toContain("Rue Haute 1, 1000 Bruxelles");
    expect(out.html).toContain("Se désinscrire");
    expect(out.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    await expect(saveCampaign(s.ctx, { id: c.id, name: "x", subject: "x", blocks: BLOCKS, segment: { kind: "ALL_CONSENTING" } })).rejects.toThrow("CAMPAIGN_LOCKED");
  });

  it("événement annulé : campagne programmée annulée et son auteur prévenu (RG-MKT-06)", async () => {
    const s = await setup();
    const c = await saveCampaign(s.ctx, { name: "Bal", subject: "Bal", blocks: BLOCKS, segment: { kind: "EVENTS", eventIds: [s.e2.id] } });
    await scheduleCampaign(s.ctx, c.id, new Date(Date.now() + DAY));
    await db.organizationMember.create({ data: { organizationId: s.org.id, userId: s.ctx.user.id, roleId: (await db.role.findFirstOrThrow({ where: { systemKey: "OWNER" } })).id } });
    await cancelEvent({ ...s.ctx, membership: { status: "ACTIVE", systemRole: "OWNER", permissions: [] } } as unknown as OrgContext, s.e2.id, "Salle indisponible", s.e2.title);
    expect((await db.emailCampaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("CANCELLED");
    expect(await db.emailMessage.count({ where: { organizationId: s.org.id, template: "campaign.cancelled" } })).toBe(1);
  });
});

describe("délivrabilité Resend (RG-MKT-03)", () => {
  it("signature vérifiée ; compteurs une seule fois ; rebond définitif bloqué ; désinscription comptée", async () => {
    const secret = `whsec_${randomBytes(24).toString("base64")}`;
    const body = JSON.stringify({ type: "email.delivered", data: { email_id: "re_x" } });
    const ts = String(Math.floor(Date.now() / 1000));
    const sig = createHmac("sha256", Buffer.from(secret.slice(6), "base64")).update(`msg_1.${ts}.${body}`).digest("base64");
    expect(verifyResendSignature(secret, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, body)).toBe(true);
    expect(verifyResendSignature(secret, { id: "msg_1", timestamp: ts, signature: `v1,${sig}` }, `${body} `)).toBe(false);
    expect(verifyResendSignature(secret, { id: "msg_1", timestamp: String(Number(ts) - 900), signature: `v1,${sig}` }, body)).toBe(false);

    const s = await setup();
    const c = await saveCampaign(s.ctx, { name: "Printemps", subject: "Printemps", blocks: BLOCKS, segment: { kind: "ALL_CONSENTING" } });
    await scheduleCampaign(s.ctx, c.id, null);
    await processCampaigns(new Date());
    const [m1, m2] = await db.emailMessage.findMany({ where: { campaignId: c.id }, orderBy: { toEmail: "asc" } });
    await db.emailMessage.update({ where: { id: m1!.id }, data: { providerMessageId: `re_${s.id}_1` } });
    await db.emailMessage.update({ where: { id: m2!.id }, data: { providerMessageId: `re_${s.id}_2` } });
    for (const type of ["email.delivered", "email.opened", "email.opened", "email.clicked"]) await applyResendEvent({ type, data: { email_id: `re_${s.id}_1` } });
    await applyResendEvent({ type: "email.bounced", data: { email_id: `re_${s.id}_2`, bounce: { type: "Permanent" } } });
    expect(await db.emailCampaign.findUniqueOrThrow({ where: { id: c.id } })).toMatchObject({ deliveredCount: 1, openCount: 1, clickCount: 1, bounceCount: 1 });
    expect(await db.emailSuppression.count({ where: { email: m2!.toEmail, organizationId: s.org.id, reason: "HARD_BOUNCE" } })).toBe(1);
    expect((await campaignAudience(s.org.id, { kind: "ALL_CONSENTING" })).map((x) => x.email)).not.toContain(m2!.toEmail);
    const token = unsubscribeToken(m1!.toEmail, s.org.id, null, c.id);
    await applyUnsubscribe(token, "ORGANIZATION");
    await applyUnsubscribe(token, "ORGANIZATION");
    expect((await db.emailCampaign.findUniqueOrThrow({ where: { id: c.id } })).unsubscribeCount).toBe(1);
  });
});
