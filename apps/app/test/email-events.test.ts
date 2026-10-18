import { createHmac, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { applyResendEvent, verifyResendSignature } from "@/server/emailEvents";

const rid = () => Math.random().toString(36).slice(2, 10);
const org = () => {
  const id = rid();
  return db.organization.create({ data: { name: `Club ${id}`, slug: `club-${id}`, subdomain: `club-${id}`, country: "BE", currency: "EUR" } });
};
const campaign = (organizationId: string) => db.emailCampaign.create({ data: { organizationId, name: "Gala", subject: "Gala", content: {}, segment: {} } });
const message = (
  over: {
    organizationId?: string | null;
    campaignId?: string | null;
    status?: "SENT" | "QUEUED" | "OPENED" | "CLICKED";
    toEmail?: string;
    category?: "MARKETING" | "TRANSACTIONAL";
  } = {},
) =>
  db.emailMessage.create({
    data: {
      providerMessageId: `re_${rid()}`,
      category: over.category ?? "MARKETING",
      template: "campaign",
      toEmail: over.toEmail ?? `lea.${rid()}@exemple.be`,
      subject: "Gala",
      status: over.status ?? "SENT",
      organizationId: over.organizationId ?? null,
      campaignId: over.campaignId ?? null,
    },
  });
const ev = (type: string, id: string | undefined, bounce?: string) => ({ type, data: { email_id: id, ...(bounce ? { bounce: { type: bounce } } : {}) } });
const msg = (id: string) => db.emailMessage.findUniqueOrThrow({ where: { id } });
const counts = async (id: string) => {
  const c = await db.emailCampaign.findUniqueOrThrow({ where: { id } });
  return { delivered: c.deliveredCount, opened: c.openCount, clicked: c.clickCount, bounced: c.bounceCount, complained: c.complaintCount };
};

describe("signature des événements du service d'envoi (format Svix)", () => {
  const secret = `whsec_${randomBytes(24).toString("base64")}`;
  const sign = (id: string, ts: string, body: string) =>
    createHmac("sha256", Buffer.from(secret.slice(6), "base64"))
      .update(`${id}.${ts}.${body}`)
      .digest("base64");
  const now = Date.now();
  const ts = String(Math.floor(now / 1000));
  const body = JSON.stringify({ type: "email.delivered" });

  it("une signature valable est acceptée, même parmi d'autres", () => {
    expect(verifyResendSignature(secret, { id: "msg_1", timestamp: ts, signature: `v1,${sign("msg_1", ts, body)}` }, body, now)).toBe(true);
    expect(verifyResendSignature(secret, { id: "msg_1", timestamp: ts, signature: `v1,ZmF1eA== v1,${sign("msg_1", ts, body)}` }, body, now)).toBe(true);
  });

  it("corps modifié, mauvaise signature ou autre version : refusé", () => {
    expect(verifyResendSignature(secret, { id: "msg_1", timestamp: ts, signature: `v1,${sign("msg_1", ts, body)}` }, `${body} `, now)).toBe(false);
    expect(verifyResendSignature(secret, { id: "msg_1", timestamp: ts, signature: "v1,ZmF1eA==" }, body, now)).toBe(false);
    expect(verifyResendSignature(secret, { id: "msg_1", timestamp: ts, signature: `v2,${sign("msg_1", ts, body)}` }, body, now)).toBe(false);
    expect(verifyResendSignature(secret, { id: "msg_1", timestamp: ts, signature: "v1" }, body, now)).toBe(false);
  });

  it("en-têtes manquants ou horodatage illisible : refusé", () => {
    expect(verifyResendSignature(secret, { id: null, timestamp: ts, signature: "v1,x" }, body, now)).toBe(false);
    expect(verifyResendSignature(secret, { id: "msg_1", timestamp: null, signature: "v1,x" }, body, now)).toBe(false);
    expect(verifyResendSignature(secret, { id: "msg_1", timestamp: ts, signature: null }, body, now)).toBe(false);
    expect(verifyResendSignature(secret, { id: "msg_1", timestamp: "demain", signature: `v1,${sign("msg_1", "demain", body)}` }, body, now)).toBe(false);
  });

  it("horodatage de plus de 5 minutes : refusé (rejeu d'un vieil événement)", () => {
    const old = String(Math.floor(now / 1000) - 301);
    expect(verifyResendSignature(secret, { id: "msg_1", timestamp: old, signature: `v1,${sign("msg_1", old, body)}` }, body, now)).toBe(false);
  });
});

describe("délivrabilité : statut des messages et compteurs de la campagne (section 9.18)", () => {
  it("remis, ouvert, cliqué : statut à jour, chaque compteur une seule fois même si l'événement est reçu deux fois", async () => {
    const o = await org();
    const c = await campaign(o.id);
    const m = await message({ organizationId: o.id, campaignId: c.id });
    for (const type of ["email.delivered", "email.opened", "email.clicked"]) {
      expect(await applyResendEvent(ev(type, m.providerMessageId!))).toBe("PROCESSED");
      expect(await applyResendEvent(ev(type, m.providerMessageId!))).toBe("IGNORED");
    }
    expect((await msg(m.id)).status).toBe("CLICKED");
    expect(await counts(c.id)).toEqual({ delivered: 1, opened: 1, clicked: 1, bounced: 0, complained: 0 });
  });

  it("un clic sans ouverture vaut ouverture", async () => {
    const o = await org();
    const c = await campaign(o.id);
    const m = await message({ organizationId: o.id, campaignId: c.id });
    await applyResendEvent(ev("email.clicked", m.providerMessageId!));
    expect((await msg(m.id)).openedAt).not.toBeNull();
    expect(await counts(c.id)).toMatchObject({ opened: 1, clicked: 1 });
  });

  it("événements dans le désordre : un statut ne recule jamais", async () => {
    const o = await org();
    const clicked = await message({ organizationId: o.id, status: "CLICKED" });
    await applyResendEvent(ev("email.opened", clicked.providerMessageId!));
    await applyResendEvent(ev("email.delivered", clicked.providerMessageId!));
    expect((await msg(clicked.id)).status).toBe("CLICKED");
    expect((await msg(clicked.id)).deliveredAt).not.toBeNull();
    const queued = await message({ organizationId: o.id, status: "QUEUED" });
    await applyResendEvent(ev("email.delivered", queued.providerMessageId!));
    expect((await msg(queued.id)).status).toBe("DELIVERED");
  });

  it("sans identifiant, message inconnu ou autre événement : ignoré", async () => {
    const m = await message();
    expect(await applyResendEvent(ev("email.delivered", undefined))).toBe("IGNORED");
    expect(await applyResendEvent(ev("email.delivered", `re_inconnu_${rid()}`))).toBe("IGNORED");
    expect(await applyResendEvent(ev("email.delivery_delayed", m.providerMessageId!))).toBe("IGNORED");
  });

  it("transactionnel sans campagne : statut à jour, aucun compteur", async () => {
    const m = await message({ category: "TRANSACTIONAL" });
    expect(await applyResendEvent(ev("email.delivered", m.providerMessageId!))).toBe("PROCESSED");
    expect((await msg(m.id)).status).toBe("DELIVERED");
  });
});

describe("liste de blocage (RG-MKT-03) et suspension des envois marketing (RG-MKT-07)", () => {
  it("rebond définitif : adresse bloquée pour l'organisation, une seule fois, quelle que soit la casse", async () => {
    const o = await org();
    const c = await campaign(o.id);
    const email = `Lea.${rid()}@Exemple.be`;
    const m = await message({ organizationId: o.id, campaignId: c.id, toEmail: email });
    expect(await applyResendEvent(ev("email.bounced", m.providerMessageId!, "Permanent"))).toBe("PROCESSED");
    expect(await applyResendEvent(ev("email.bounced", m.providerMessageId!, "Permanent"))).toBe("IGNORED");
    const again = await message({ organizationId: o.id, toEmail: email });
    await applyResendEvent(ev("email.bounced", again.providerMessageId!, "Permanent"));
    expect(await db.emailSuppression.findMany({ where: { organizationId: o.id }, select: { email: true, reason: true, scope: true } })).toEqual([
      { email: email.toLowerCase(), reason: "HARD_BOUNCE", scope: "ORGANIZATION" },
    ]);
    expect((await msg(m.id)).status).toBe("BOUNCED");
    expect(await counts(c.id)).toMatchObject({ bounced: 1 });
  });

  it("rebond temporaire : message noté, adresse jamais bloquée", async () => {
    const o = await org();
    const m = await message({ organizationId: o.id });
    await applyResendEvent(ev("email.bounced", m.providerMessageId!, "Transient"));
    expect((await msg(m.id)).status).toBe("BOUNCED");
    expect(await db.emailSuppression.count({ where: { organizationId: o.id } })).toBe(0);
  });

  it("message de la plateforme, sans organisation : rien n'est bloqué", async () => {
    const m = await message({ organizationId: null, toEmail: `plateforme.${rid()}@exemple.be` });
    await applyResendEvent(ev("email.complained", m.providerMessageId!));
    expect((await msg(m.id)).status).toBe("COMPLAINED");
    expect(await db.emailSuppression.count({ where: { email: m.toEmail } })).toBe(0);
  });

  it("plainte : adresse bloquée ; au-delà de 0,3 % sur 1 000 remis, envois marketing suspendus et propriétaire prévenu", async () => {
    const o = await org();
    const owner = await db.user.create({ data: { name: "Camille", email: `own.${rid()}@exemple.be`, emailVerified: true } });
    const role = await db.role.findUniqueOrThrow({ where: { systemKey: "OWNER" } });
    await db.organizationMember.create({ data: { organizationId: o.id, userId: owner.id, roleId: role.id } });
    const first = await message({ organizationId: o.id });
    await applyResendEvent(ev("email.complained", first.providerMessageId!));
    expect(await db.emailSuppression.count({ where: { organizationId: o.id, reason: "COMPLAINT" } })).toBe(1);
    expect((await db.organization.findUniqueOrThrow({ where: { id: o.id } })).marketingDailyCap).not.toBe(0); // trop peu d'envois pour juger
    await db.emailMessage.createMany({
      data: Array.from({ length: 1000 }, () => ({
        providerMessageId: `re_${rid()}${rid()}`,
        category: "MARKETING" as const,
        template: "campaign",
        toEmail: `x.${rid()}@exemple.be`,
        subject: "Gala",
        status: "DELIVERED" as const,
        deliveredAt: new Date(),
        organizationId: o.id,
      })),
    });
    for (let i = 0; i < 2; i++) await applyResendEvent(ev("email.complained", (await message({ organizationId: o.id })).providerMessageId!));
    expect((await db.organization.findUniqueOrThrow({ where: { id: o.id } })).marketingDailyCap).not.toBe(0); // 3 sur 1 000 : à la limite, pas au-delà
    await applyResendEvent(ev("email.complained", (await message({ organizationId: o.id })).providerMessageId!));
    expect((await db.organization.findUniqueOrThrow({ where: { id: o.id } })).marketingDailyCap).toBe(0);
    expect(await db.emailMessage.count({ where: { template: "marketing.suspended", toEmail: owner.email } })).toBe(1);
  });
});
