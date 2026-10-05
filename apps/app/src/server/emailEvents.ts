import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { complaintRateExceeded } from "@evoly/core";
import { db } from "@/lib/db";
import { audit } from "./audit";
import { sendEmail } from "./email/send";

/** Vérification d'un webhook Resend (format Svix) : HMAC-SHA256 de « id.horodatage.corps », horodatage à 5 minutes près. */
export function verifyResendSignature(
  secret: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  body: string,
  now = Date.now(),
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${headers.id}.${headers.timestamp}.${body}`).digest();
  return headers.signature.split(" ").some((part) => {
    const [version, sig] = part.split(",");
    if (version !== "v1" || !sig) return false;
    const given = Buffer.from(sig, "base64");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

type ResendEvent = { type: string; created_at?: string; data: { email_id?: string; bounce?: { type?: string } } };

/**
 * Délivrabilité (section 9.18, statistiques) : statut du message, compteurs de la campagne (une seule fois par message),
 * liste de blocage de l'organisation sur rebond définitif ou plainte (RG-MKT-03), suspension au-delà de 0,3 % de plaintes (RG-MKT-07).
 */
export async function applyResendEvent(event: ResendEvent, now = new Date()): Promise<"PROCESSED" | "IGNORED"> {
  const id = event.data?.email_id;
  if (!id) return "IGNORED";
  const msg = await db.emailMessage.findUnique({ where: { providerMessageId: id } });
  if (!msg) return "IGNORED";
  const inc = (field: "deliveredCount" | "openCount" | "clickCount" | "bounceCount" | "complaintCount") =>
    msg.campaignId ? db.emailCampaign.update({ where: { id: msg.campaignId }, data: { [field]: { increment: 1 } } }) : null;
  const block = async (reason: "HARD_BOUNCE" | "COMPLAINT") => {
    if (!msg.organizationId) return;
    const where = { email: msg.toEmail.toLowerCase(), scope: "ORGANIZATION" as const, organizationId: msg.organizationId, eventId: null };
    if (!(await db.emailSuppression.findFirst({ where, select: { id: true } }))) await db.emailSuppression.create({ data: { ...where, reason } });
  };
  switch (event.type) {
    case "email.delivered":
      if (msg.deliveredAt) return "IGNORED";
      await db.emailMessage.update({
        where: { id: msg.id },
        data: { deliveredAt: now, ...(msg.status === "SENT" || msg.status === "QUEUED" ? { status: "DELIVERED" } : {}) },
      });
      await inc("deliveredCount");
      return "PROCESSED";
    case "email.opened":
      if (msg.openedAt) return "IGNORED";
      await db.emailMessage.update({ where: { id: msg.id }, data: { openedAt: now, ...(msg.status !== "CLICKED" ? { status: "OPENED" } : {}) } });
      await inc("openCount");
      return "PROCESSED";
    case "email.clicked":
      if (msg.clickedAt) return "IGNORED";
      await db.emailMessage.update({ where: { id: msg.id }, data: { clickedAt: now, status: "CLICKED", ...(msg.openedAt ? {} : { openedAt: now }) } });
      await inc("clickCount");
      if (!msg.openedAt) await inc("openCount"); // un clic vaut ouverture
      return "PROCESSED";
    case "email.bounced": {
      if (msg.status === "BOUNCED") return "IGNORED";
      await db.emailMessage.update({ where: { id: msg.id }, data: { status: "BOUNCED" } });
      await inc("bounceCount");
      if (event.data.bounce?.type !== "Transient") await block("HARD_BOUNCE");
      return "PROCESSED";
    }
    case "email.complained": {
      if (msg.status === "COMPLAINED") return "IGNORED";
      await db.emailMessage.update({ where: { id: msg.id }, data: { status: "COMPLAINED" } });
      await inc("complaintCount");
      await block("COMPLAINT");
      if (msg.organizationId) await checkComplaintRate(msg.organizationId, now);
      return "PROCESSED";
    }
    default:
      return "IGNORED";
  }
}

/** RG-MKT-07 : au-delà de 0,3 % de plaintes sur 30 jours, les envois marketing de l'organisation sont suspendus. */
async function checkComplaintRate(organizationId: string, now: Date) {
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const [complaints, delivered] = await Promise.all([
    db.emailMessage.count({ where: { organizationId, category: "MARKETING", status: "COMPLAINED", queuedAt: { gte: since } } }),
    db.emailMessage.count({ where: { organizationId, category: "MARKETING", deliveredAt: { not: null }, queuedAt: { gte: since } } }),
  ]);
  if (complaintRateExceeded(complaints, delivered)) {
    await db.organization.update({ where: { id: organizationId }, data: { marketingDailyCap: 0 } });
    await audit({
      action: "marketing.suspended",
      organizationId,
      actorType: "SYSTEM",
      targetType: "Organization",
      targetId: organizationId,
      metadata: { complaints, delivered },
    });
    const owner = await db.organizationMember.findFirst({
      where: { organizationId, role: { systemKey: "OWNER" } },
      include: { user: { select: { email: true, name: true } }, organization: { select: { name: true } } },
    });
    if (owner)
      await sendEmail({
        to: owner.user.email,
        template: "marketing.suspended",
        category: "SERVICE",
        organizationId,
        subject: `Envois marketing suspendus pour ${owner.organization.name}`,
        text: `Bonjour ${owner.user.name},\n\nTrop de destinataires ont signalé vos e-mails marketing comme indésirables (plus de 0,3 % sur 30 jours). Vos campagnes et e-mails automatiques marketing sont suspendus ; les e-mails liés aux achats et les rappels continuent. Répondez à cet e-mail pour faire le point avec nous.\n\nEvoly`,
        html: `<p>Bonjour ${owner.user.name.replace(/</g, "&lt;")},</p><p>Trop de destinataires ont signalé vos e-mails marketing comme indésirables (plus de 0,3 % sur 30 jours). Vos campagnes et e-mails automatiques marketing sont <strong>suspendus</strong> ; les e-mails liés aux achats et les rappels continuent.</p><p>Répondez à cet e-mail pour faire le point avec nous.</p><p>Evoly</p>`,
      }).catch(() => undefined);
  }
}
