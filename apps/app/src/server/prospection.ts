import "server-only";
import { randomInt } from "node:crypto";
import { CoreError, zonedLocalToUtc } from "@evoly/core";
import nodemailer from "nodemailer";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { safeError } from "@/lib/redact";

/**
 * Prospection d'Evoly (back-office) : lots d'e-mails rédigés au cas par cas, importés en JSON, programmés et envoyés
 * un à un par la boîte de prospection (SMTP dédié, jamais Resend ni evoly.me), dans une limite quotidienne.
 */
const FUSEAU = "Europe/Brussels";
const DAY = 86_400_000;

const emailSchema = z.object({
  id: z.string().trim().min(1).max(80),
  a: z.string().trim().toLowerCase().pipe(z.email().max(200)),
  organisation: z.string().trim().min(1).max(200),
  objet: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(10_000),
  source: z.string().trim().max(500).optional(),
  pourquoi: z.string().trim().max(1000).optional(),
});

export type ImportReport = { lot: string; ajoutes: number; ignores: { id: string; a: string; raison: string }[] };
export type Sender = (m: { from: string; to: string; subject: string; text: string }) => Promise<{ messageId?: string }>;

const STATUT: Record<string, string> = { EXCLU: "exclue", PAS_INTERESSE: "pas intéressée", CLIENT: "déjà cliente" };

export function prospectionConfig() {
  const e = env();
  const [min, max] = e.PROSPECTION_DELAY_SECONDS.split("-").map(Number) as [number, number];
  return {
    configured: !!(e.PROSPECTION_SMTP_URL && e.PROSPECTION_FROM),
    from: e.PROSPECTION_FROM ?? "",
    cap: e.PROSPECTION_DAILY_CAP,
    delay: [Math.min(min, max), Math.max(min, max)] as const,
  };
}

/** Début de la journée en Belgique, pour la limite quotidienne. */
export function dayStart(now: Date) {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return zonedLocalToUtc(`${d}T00:00`, FUSEAU);
}

const sentSince = (since: Date) => db.prospectEmail.count({ where: { status: "ENVOYE", sentAt: { gte: since } } });

/** Import d'un lot : chaque e-mail vérifié un à un ; doublons, organisations exclues ou déjà contactées écartés avec leur raison. */
export async function importLot(raw: unknown, now = new Date()): Promise<ImportReport> {
  const top = raw as { lot?: unknown; emails?: unknown };
  if (!top || typeof top !== "object" || !Array.isArray(top.emails)) throw new CoreError("PROSPECTION_LOT_INVALID");
  if (top.emails.length > 500) throw new CoreError("PROSPECTION_LOT_TOO_LARGE");
  const lot = (typeof top.lot === "string" && top.lot.trim().slice(0, 60)) || new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU }).format(now);
  const report: ImportReport = { lot, ajoutes: 0, ignores: [] };
  for (const item of top.emails) {
    const parsed = emailSchema.safeParse(item);
    const ref = { id: String((item as { id?: unknown })?.id ?? "?"), a: String((item as { a?: unknown })?.a ?? "?") };
    if (!parsed.success) {
      report.ignores.push({ ...ref, raison: `champ manquant ou invalide : ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}` });
      continue;
    }
    const e = parsed.data;
    if (await db.prospectEmail.findUnique({ where: { externalId: e.id }, select: { id: true } })) {
      report.ignores.push({ id: e.id, a: e.a, raison: "déjà importé (même identifiant)" });
      continue;
    }
    const prospect = await db.prospect.findUnique({ where: { email: e.a }, select: { id: true, status: true } });
    if (prospect && STATUT[prospect.status]) {
      report.ignores.push({ id: e.id, a: e.a, raison: `organisation ${STATUT[prospect.status]}` });
      continue;
    }
    if (prospect && (await db.prospectEmail.count({ where: { prospectId: prospect.id, status: { in: ["A_ENVOYER", "PROGRAMME", "ENVOYE"] } } }))) {
      report.ignores.push({ id: e.id, a: e.a, raison: "déjà contactée ou déjà prévue" });
      continue;
    }
    const p =
      prospect ??
      (await db.prospect.create({ data: { email: e.a, organisation: e.organisation, source: e.source ?? null }, select: { id: true, status: true } }));
    await db.prospectEmail.create({
      data: { externalId: e.id, lot, prospectId: p.id, toEmail: e.a, subject: e.objet, body: e.message, why: e.pourquoi ?? null, source: e.source ?? null },
    });
    report.ajoutes++;
  }
  return report;
}

/** Programme les e-mails à envoyer d'un lot : espacés au hasard, sans dépasser la limite du jour (envoyés et programmés compris). */
export async function scheduleLot(lot: string, now = new Date(), rand = (a: number, b: number) => randomInt(a, b + 1)) {
  const { cap, delay } = prospectionConfig();
  const since = dayStart(now);
  const until = new Date(since.getTime() + DAY);
  const used = (await sentSince(since)) + (await db.prospectEmail.count({ where: { status: "PROGRAMME", scheduledAt: { gte: since, lt: until } } }));
  const room = Math.max(0, cap - used);
  const pending = await db.prospectEmail.findMany({ where: { lot, status: "A_ENVOYER" }, orderBy: { createdAt: "asc" }, take: room, select: { id: true } });
  const last = await db.prospectEmail.findFirst({ where: { status: "PROGRAMME" }, orderBy: { scheduledAt: "desc" }, select: { scheduledAt: true } });
  let t = Math.max(now.getTime() + 10_000, last?.scheduledAt ? last.scheduledAt.getTime() + rand(delay[0], delay[1]) * 1000 : 0);
  for (const [i, e] of pending.entries()) {
    if (i > 0) t += rand(delay[0], delay[1]) * 1000;
    await db.prospectEmail.update({ where: { id: e.id }, data: { status: "PROGRAMME", scheduledAt: new Date(t), error: null } });
  }
  return { programmes: pending.length, restants: await db.prospectEmail.count({ where: { lot, status: "A_ENVOYER" } }) };
}

let transport: nodemailer.Transporter | null = null;
const smtpSend: Sender = async (m) => {
  transport ??= nodemailer.createTransport(env().PROSPECTION_SMTP_URL!);
  const r = await transport.sendMail(m);
  return { messageId: r.messageId };
};

/** Envoi d'un e-mail, réservé d'abord pour qu'il ne parte jamais deux fois. */
async function deliver(id: string, now: Date, send: Sender, from: string[]) {
  const claimed = await db.prospectEmail.updateMany({ where: { id, status: { in: from as never } }, data: { status: "ENVOYE", sentAt: now, error: null } });
  if (claimed.count === 0) return false;
  const e = await db.prospectEmail.findUniqueOrThrow({ where: { id } });
  try {
    const r = await send({ from: prospectionConfig().from, to: e.toEmail, subject: e.subject, text: e.body });
    await db.$transaction([
      db.prospectEmail.update({ where: { id }, data: { messageId: r.messageId ?? null } }),
      db.prospect.update({ where: { id: e.prospectId }, data: { lastContactAt: now } }),
      db.prospect.updateMany({ where: { id: e.prospectId, status: "NOUVEAU" }, data: { status: "CONTACTE" } }),
    ]);
    return true;
  } catch (err) {
    await db.prospectEmail.update({ where: { id }, data: { status: "ECHEC", sentAt: null, error: safeError(err) } });
    return false;
  }
}

/** Tâche planifiée, chaque minute : envoie l'e-mail programmé le plus ancien qui est dû, dans la limite du jour. */
export async function sendDueProspectEmails(now = new Date(), send: Sender = smtpSend) {
  const c = prospectionConfig();
  if (!c.configured) return { sent: 0 };
  if ((await sentSince(dayStart(now))) >= c.cap) return { sent: 0 };
  const due = await db.prospectEmail.findFirst({
    where: { status: "PROGRAMME", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
    select: { id: true },
  });
  if (!due) return { sent: 0 };
  return { sent: (await deliver(due.id, now, send, ["PROGRAMME"])) ? 1 : 0 };
}

/** « Envoyer maintenant » depuis le back-office, dans la limite du jour. */
export async function sendNow(id: string, now = new Date(), send: Sender = smtpSend) {
  const c = prospectionConfig();
  if (!c.configured) throw new CoreError("PROSPECTION_NOT_CONFIGURED");
  if ((await sentSince(dayStart(now))) >= c.cap) throw new CoreError("PROSPECTION_DAILY_CAP");
  if (!(await deliver(id, now, send, ["A_ENVOYER", "PROGRAMME", "ECHEC"]))) throw new CoreError("PROSPECTION_SEND_FAILED");
}

export async function withdrawEmail(id: string) {
  await db.prospectEmail.updateMany({ where: { id, status: { in: ["A_ENVOYER", "PROGRAMME", "ECHEC"] } }, data: { status: "RETIRE", scheduledAt: null } });
}

export async function retryEmail(id: string) {
  await db.prospectEmail.updateMany({ where: { id, status: "ECHEC" }, data: { status: "A_ENVOYER", error: null } });
}

export async function updateProspect(id: string, data: { status: string; notes: string }) {
  const status = z.enum(["NOUVEAU", "CONTACTE", "REPONDU", "CLIENT", "PAS_INTERESSE", "EXCLU"]).parse(data.status);
  await db.prospect.update({ where: { id }, data: { status, notes: data.notes.trim().slice(0, 2000) || null } });
  if (status === "EXCLU" || status === "PAS_INTERESSE")
    await db.prospectEmail.updateMany({ where: { prospectId: id, status: { in: ["A_ENVOYER", "PROGRAMME"] } }, data: { status: "RETIRE", scheduledAt: null } });
}

/** Vue d'ensemble pour le back-office. */
export async function prospectionOverview(now = new Date()) {
  const [byStatus, sentToday, lots, next] = await Promise.all([
    db.prospectEmail.groupBy({ by: ["status"], _count: { _all: true } }),
    sentSince(dayStart(now)),
    db.prospectEmail.groupBy({ by: ["lot"], _count: { _all: true }, _max: { createdAt: true }, orderBy: { _max: { createdAt: "desc" } }, take: 12 }),
    db.prospectEmail.findFirst({ where: { status: "PROGRAMME" }, orderBy: { scheduledAt: "asc" }, select: { scheduledAt: true } }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  return {
    ...prospectionConfig(),
    sentToday,
    aEnvoyer: count("A_ENVOYER"),
    programmes: count("PROGRAMME"),
    echecs: count("ECHEC"),
    envoyes: count("ENVOYE"),
    prochain: next?.scheduledAt ?? null,
    lots: lots.map((l) => ({ lot: l.lot, total: l._count._all })),
  };
}

export function lotEmails(lot: string) {
  return db.prospectEmail.findMany({ where: { lot }, orderBy: { createdAt: "asc" }, include: { prospect: { select: { organisation: true, status: true } } } });
}

export function listProspects(q?: string, status?: string) {
  return db.prospect.findMany({
    where: {
      ...(q ? { OR: [{ organisation: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
      ...(status ? { status: status as never } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: { _count: { select: { emails: true } } },
  });
}
