import "server-only";
import { Prisma } from "@evoly/db";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Resend } from "resend";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { RenderedEmail } from "./templates";

type Category = "TRANSACTIONAL" | "SERVICE" | "MARKETING";

interface SendInput extends RenderedEmail {
  to: string;
  template: string;
  category: Category;
  organizationId?: string;
  fromName?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
  /** Commande concernée : l'e-mail apparaît dans l'historique de la commande (RG-ORD-01). */
  orderId?: string;
  automationId?: string;
  campaignId?: string;
  contactId?: string;
  /** RG-MKT-02 et RFC 8058 : désinscription en un clic depuis la messagerie (List-Unsubscribe). */
  unsubscribeUrl?: string;
}

let resend: Resend | null | undefined;

/**
 * Envoi d'un e-mail, journalisé dans EmailMessage (section 6.9).
 * Sans clé Resend (développement, tests), l'e-mail est écrit dans EMAIL_OUTBOX_DIR.
 */
type Payload = { from: string; to: string; subject: string; html: string; text: string; replyTo?: string | null; headers?: Record<string, string>; template: string; attachments?: Array<{ filename: string; contentType?: string; content: Buffer }> };

/** Tests uniquement : simule des pannes du fournisseur d'e-mails (RG-ARC-06). */
export const emailTestHooks = { failNext: 0 };

async function deliver(p: Payload, messageId: string): Promise<string | null> {
  const e = env();
  if (process.env.NODE_ENV === "test" && emailTestHooks.failNext > 0) {
    emailTestHooks.failNext -= 1;
    throw new Error("panne simulée du fournisseur d'e-mails");
  }
  if (resend === undefined) resend = e.RESEND_API_KEY ? new Resend(e.RESEND_API_KEY) : null;
  if (resend) {
    const { data, error } = await resend.emails.send({ from: p.from, to: p.to, subject: p.subject, html: p.html, text: p.text, replyTo: p.replyTo ?? undefined, headers: p.headers, attachments: p.attachments?.map((a) => ({ filename: a.filename, content: a.content, contentType: a.contentType })) });
    if (error) throw new Error(error.message);
    return data?.id ?? null;
  }
  const dir = e.EMAIL_OUTBOX_DIR ?? path.join(process.cwd(), ".outbox");
  await mkdir(dir, { recursive: true });
  const stamp = `${Date.now()}-${messageId}`;
  const attachments = [];
  for (const a of p.attachments ?? []) {
    const file = path.join(dir, `${stamp}-${a.filename}`);
    await writeFile(file, a.content);
    attachments.push({ filename: a.filename, contentType: a.contentType, size: a.content.length, path: file });
  }
  await writeFile(path.join(dir, `${stamp}.json`), JSON.stringify({ from: p.from, to: p.to, subject: p.subject, template: p.template, headers: p.headers, text: p.text, html: p.html, attachments }, null, 2));
  return null;
}

const RETRY_BASE_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;
const toStored = (p: Payload) => ({ ...p, attachments: p.attachments?.map((a) => ({ filename: a.filename, contentType: a.contentType, content: a.content.toString("base64") })) });
type StoredPayload = Omit<Payload, "attachments"> & { attachments?: Array<{ filename: string; contentType?: string; content: string }> };
const fromStored = (v: unknown): Payload => {
  const p = v as StoredPayload;
  return { ...p, attachments: p.attachments?.map((a) => ({ filename: a.filename, contentType: a.contentType, content: Buffer.from(String(a.content), "base64") })) };
};

/**
 * Envoi d'un e-mail, journalisé dans EmailMessage (section 6.9). Sans clé Resend (développement, tests), l'e-mail est
 * écrit dans EMAIL_OUTBOX_DIR. RG-ARC-06 : en cas d'échec, le contenu est gardé et renvoyé par la tâche planifiée.
 */
export async function sendEmail(input: SendInput): Promise<void> {
  const e = env();
  const payload: Payload = { from: `${input.fromName ?? "Evoly"} <no-reply@${e.EMAIL_FROM_DOMAIN}>`, to: input.to, subject: input.subject, html: input.html, text: input.text, replyTo: input.replyTo ?? null, headers: input.unsubscribeUrl ? { "List-Unsubscribe": `<${input.unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined, template: input.template, attachments: input.attachments };
  const message = await db.emailMessage.create({
    data: { organizationId: input.organizationId ?? null, orderId: input.orderId ?? null, automationId: input.automationId ?? null, campaignId: input.campaignId ?? null, contactId: input.contactId ?? null, category: input.category, template: input.template, toEmail: input.to, subject: input.subject, status: "QUEUED" },
  });
  try {
    const providerMessageId = await deliver(payload, message.id);
    await db.emailMessage.update({ where: { id: message.id }, data: { status: "SENT", sentAt: new Date(), providerMessageId, attempts: 1 } });
  } catch (err) {
    await db.emailMessage.update({ where: { id: message.id }, data: { status: "FAILED", error: String(err).slice(0, 500), attempts: 1, nextAttemptAt: new Date(Date.now() + RETRY_BASE_MS), retryPayload: toStored(payload) as unknown as Prisma.InputJsonValue } });
    throw err;
  }
}

/** Tâche planifiée (RG-ARC-06) : renvoi des e-mails en échec, délai doublé à chaque essai, 5 tentatives au plus. */
export async function retryFailedEmails(now = new Date()): Promise<{ sent: number; failed: number }> {
  const due = await db.emailMessage.findMany({ where: { status: "FAILED", nextAttemptAt: { lte: now }, attempts: { lt: MAX_ATTEMPTS }, NOT: { retryPayload: { equals: Prisma.DbNull } } }, take: 100, orderBy: { nextAttemptAt: "asc" } });
  let sent = 0;
  let failed = 0;
  for (const m of due) {
    try {
      const providerMessageId = await deliver(fromStored(m.retryPayload), m.id);
      await db.emailMessage.update({ where: { id: m.id }, data: { status: "SENT", sentAt: new Date(), providerMessageId, attempts: m.attempts + 1, retryPayload: Prisma.DbNull, nextAttemptAt: null, error: null } });
      sent += 1;
    } catch (err) {
      const attempts = m.attempts + 1;
      await db.emailMessage.update({ where: { id: m.id }, data: { attempts, error: String(err).slice(0, 500), nextAttemptAt: attempts >= MAX_ATTEMPTS ? null : new Date(now.getTime() + RETRY_BASE_MS * 2 ** (attempts - 1)), ...(attempts >= MAX_ATTEMPTS ? { retryPayload: Prisma.DbNull } : {}) } });
      failed += 1;
    }
  }
  return { sent, failed };
}
