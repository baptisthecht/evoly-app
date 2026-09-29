import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { CoreError, normalizeAccessCode, validateQuestion, type QuestionDef } from "@evoly/core";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { findEvent } from "./events";

/** Questions publiques d'un événement (actives, dans l'ordre), telles que les voit l'acheteur. */
export async function publicQuestions(eventId: string): Promise<Array<QuestionDef & { helpText: string | null }>> {
  const rows = await db.checkoutQuestion.findMany({ where: { eventId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  return rows.map((q) => ({ id: q.id, label: q.label, helpText: q.helpText, type: q.type, required: q.required, options: (q.options as string[] | null) ?? null, scope: q.scope, ticketTypeIds: q.ticketTypeIds }));
}

export async function listQuestions(ctx: OrgContext, eventId: string) {
  await findEvent(ctx, eventId);
  return db.checkoutQuestion.findMany({ where: { eventId }, include: { _count: { select: { answers: true } } }, orderBy: [{ archivedAt: { sort: "asc", nulls: "first" } }, { sortOrder: "asc" }, { createdAt: "asc" }] });
}

/** US-QST-01 : création ou modification d'une question. */
export async function saveQuestion(ctx: OrgContext, eventId: string, id: string | null, input: Record<string, unknown>) {
  const event = await findEvent(ctx, eventId);
  const v = validateQuestion(input);
  if (!v.ok) throw new CoreError(v.code);
  const types = await db.ticketType.findMany({ where: { eventId: event.id, id: { in: v.value.ticketTypeIds } }, select: { id: true } });
  const data = { ...v.value, ticketTypeIds: types.map((t) => t.id), options: v.value.options ?? undefined };
  if (id) {
    const q = await db.checkoutQuestion.findFirst({ where: { id, eventId: event.id } });
    if (!q) throw new CoreError("NOT_FOUND");
    // le type d'une question qui a des réponses ne change pas (les réponses resteraient incohérentes)
    if (q.type !== data.type && (await db.questionAnswer.count({ where: { questionId: q.id } })) > 0) throw new CoreError("QUESTION_TYPE_LOCKED");
    return db.checkoutQuestion.update({ where: { id: q.id }, data });
  }
  const last = await db.checkoutQuestion.aggregate({ where: { eventId: event.id }, _max: { sortOrder: true } });
  const created = await db.checkoutQuestion.create({ data: { ...data, eventId: event.id, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  await audit({ action: "question.created", organizationId: ctx.organization.id, actorUserId: ctx.user.id, targetType: "CheckoutQuestion", targetId: created.id });
  return created;
}

export async function moveQuestion(ctx: OrgContext, eventId: string, id: string, direction: -1 | 1) {
  await findEvent(ctx, eventId);
  const list = await db.checkoutQuestion.findMany({ where: { eventId, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true } });
  const i = list.findIndex((q) => q.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j]!, list[i]!];
  await db.$transaction(list.map((q, k) => db.checkoutQuestion.update({ where: { id: q.id }, data: { sortOrder: k + 1 } })));
}

/** RG-QST-03 : supprimée si elle n'a aucune réponse, sinon archivée (les réponses restent consultables). */
export async function removeQuestion(ctx: OrgContext, eventId: string, id: string): Promise<"DELETED" | "ARCHIVED"> {
  await findEvent(ctx, eventId);
  const q = await db.checkoutQuestion.findFirst({ where: { id, eventId }, include: { _count: { select: { answers: true } } } });
  if (!q) throw new CoreError("NOT_FOUND");
  if (q._count.answers === 0) {
    await db.checkoutQuestion.delete({ where: { id: q.id } });
    return "DELETED";
  }
  await db.checkoutQuestion.update({ where: { id: q.id }, data: { archivedAt: new Date() } });
  return "ARCHIVED";
}

const cell = (v: unknown) => {
  const s = v == null ? "" : Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "oui" : "non") : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Export des réponses : une ligne par commande (questions par commande) ou par billet (questions par billet). */
export async function answersCsv(ctx: OrgContext, eventId: string): Promise<string> {
  await findEvent(ctx, eventId);
  const questions = await db.checkoutQuestion.findMany({ where: { eventId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
  const orders = await db.order.findMany({ where: { eventId, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } }, include: { answers: true, tickets: { select: { id: true, shortCode: true, holderFirstName: true, holderLastName: true, ticketType: { select: { name: true } } } } }, orderBy: { paidAt: "asc" } });
  const head = ["Référence", "Acheteur", "E-mail", "Billet", "Tarif", "Titulaire", ...questions.map((q) => q.label)];
  const lines: unknown[][] = [];
  for (const o of orders) {
    const orderValues = (qid: string) => (o.answers.find((a) => a.questionId === qid && !a.ticketId)?.value as { value?: unknown } | undefined)?.value;
    const rows = o.tickets.length ? o.tickets : [null];
    for (const t of rows) {
      lines.push([o.reference, `${o.buyerFirstName} ${o.buyerLastName}`, o.buyerEmail, t?.shortCode ?? "", t?.ticketType.name ?? "", t?.holderFirstName ? `${t.holderFirstName} ${t.holderLastName ?? ""}`.trim() : "", ...questions.map((q) => (q.scope === "TICKET" ? (o.answers.find((a) => a.questionId === q.id && a.ticketId === t?.id)?.value as { value?: unknown } | undefined)?.value : orderValues(q.id)))]);
    }
  }
  return "\ufeff" + [head, ...lines].map((l) => l.map(cell).join(";")).join("\r\n") + "\r\n";
}

// —— événements privés (RG-PUB-06) ——

const secret = () => env().ORDER_TOKEN_SECRET ?? env().BETTER_AUTH_SECRET;
export const accessCodeHash = (eventId: string, code: string) => createHmac("sha256", `access:${secret()}`).update(`${eventId}:${code}`).digest("hex");
const grantFor = (eventId: string, codeHash: string) => createHmac("sha256", `grant:${secret()}`).update(`${eventId}:${codeHash}`).digest("base64url").slice(0, 40);
export const accessCookieName = (eventId: string) => `evoly_access_${eventId}`;

/** Accès accordé à ce navigateur : lié au code actuel (changer le code révoque les accès déjà donnés). */
export async function hasEventAccess(event: { id: string; visibility: string; accessCodeHash: string | null }): Promise<boolean> {
  if (event.visibility !== "PRIVATE") return true;
  if (!event.accessCodeHash) return false;
  const value = (await cookies()).get(accessCookieName(event.id))?.value ?? "";
  const expected = grantFor(event.id, event.accessCodeHash);
  return value.length === expected.length && timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

/** Saisie du code : vérifié en temps constant, puis accès mémorisé 30 jours sur ce navigateur. */
export async function unlockEvent(eventId: string, input: string): Promise<boolean> {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { id: true, visibility: true, accessCodeHash: true } });
  const code = normalizeAccessCode(input);
  if (!event || event.visibility !== "PRIVATE" || !event.accessCodeHash || !code) return false;
  const given = Buffer.from(accessCodeHash(event.id, code));
  const stored = Buffer.from(event.accessCodeHash);
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) return false;
  (await cookies()).set(accessCookieName(event.id), grantFor(event.id, event.accessCodeHash), { httpOnly: true, sameSite: "lax", secure: env().NEXT_PUBLIC_APP_URL.startsWith("https"), path: "/", maxAge: 30 * 86_400 });
  return true;
}
