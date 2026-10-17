import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";
import { CoreError, zonedLocalToUtc } from "@evoly/core";
import type { ProspectMailbox } from "@evoly/db";
import { ImapFlow } from "imapflow";
import nodemailer, { type Transporter } from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { safeError } from "@/lib/redact";
import { checkAddress } from "./emailCheck";

/**
 * Prospection d'Evoly (back-office) : boîtes d'envoi configurées dans le back-office (mot de passe chiffré), capacité
 * du jour calculée pour chaque boîte (montée en charge selon sa date de début, moins ce qu'elle a déjà envoyé ou
 * programmé), lots JSON répartis au hasard entre les boîtes selon leur place, puis envoyés un à un, en parallèle,
 * jamais par Resend ni depuis evoly.me.
 */
const FUSEAU = "Europe/Brussels";
const DAY = 86_400_000;

export type Outgoing = { from: string; to: string; subject: string; text: string; messageId: string; date: Date };
export type Sender = (m: Outgoing, box: ProspectMailbox) => Promise<void>;
export type Copier = (raw: Buffer, box: ProspectMailbox, date: Date) => Promise<void>;
type Rand = (a: number, b: number) => number;
const defaultRand: Rand = (a, b) => randomInt(a, b + 1);

// ---------------------------------------------------------------- outils

export function dayStart(now: Date) {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return zonedLocalToUtc(`${d}T00:00`, FUSEAU);
}

function delay() {
  const [a, b] = env().PROSPECTION_DELAY_SECONDS.split("-").map(Number) as [number, number];
  return [Math.min(a, b), Math.max(a, b)] as const;
}

/** Montée en charge selon l'ancienneté de la boîte : 15 par jour la première semaine, 25 la deuxième, puis son plafond. */
export function rampCap(startedAt: Date, maxPerDay: number, now: Date, rampUp = true) {
  const days = Math.round((dayStart(now).getTime() - dayStart(startedAt).getTime()) / DAY);
  if (days < 0) return 0;
  if (!rampUp) return maxPerDay;
  return Math.min(days < 7 ? 15 : days < 14 ? 25 : maxPerDay, maxPerDay);
}

/** Calendrier de montée en charge d'une boîte, à partir d'aujourd'hui : [{ du, par jour }]. */
export function rampSchedule(startedAt: Date, maxPerDay: number, now: Date, rampUp = true) {
  const start = dayStart(startedAt).getTime();
  if (!rampUp) return [{ from: start, perDay: maxPerDay, until: null }];
  const steps = [
    { from: start, perDay: Math.min(15, maxPerDay) },
    { from: start + 7 * DAY, perDay: Math.min(25, maxPerDay) },
    { from: start + 14 * DAY, perDay: maxPerDay },
  ].filter((st, i, all) => i === 0 || st.perDay !== all[i - 1]!.perDay);
  const today = dayStart(now).getTime();
  return steps
    .filter((st, i) => i === steps.length - 1 || steps[i + 1]!.from > today)
    .map((st, i, all) => ({ ...st, until: all[i + 1] ? new Date(all[i + 1]!.from - DAY) : null }));
}

const key = () => createHash("sha256").update(`prospection:${env().BETTER_AUTH_SECRET}`).digest();
export function sealPassword(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString("base64url");
}
export function openPassword(blob: string) {
  const raw = Buffer.from(blob, "base64url");
  const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString("utf8");
}

const transports = new Map<string, { at: number; t: Transporter }>();
function transportFor(box: ProspectMailbox) {
  const cached = transports.get(box.id);
  if (cached && cached.at === box.updatedAt.getTime()) return cached.t;
  const t = nodemailer.createTransport({
    host: box.smtpHost,
    port: box.smtpPort,
    secure: box.smtpPort === 465,
    auth: { user: box.username, pass: openPassword(box.passwordEnc) },
  });
  transports.set(box.id, { at: box.updatedAt.getTime(), t });
  return t;
}
/** Le même message, composé une fois : envoyé au destinataire, puis rangé tel quel dans « Envoyés ». */
export function buildRaw(m: Outgoing): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    new MailComposer({ from: m.from, to: m.to, subject: m.subject, text: m.text, messageId: m.messageId, date: m.date })
      .compile()
      .build((err, msg) => (err ? reject(err) : resolve(msg))),
  );
}
const smtpSend: Sender = async (m, box) => {
  await transportFor(box).sendMail({ envelope: { from: box.address, to: [m.to] }, raw: await buildRaw(m) });
};
/** Copie dans le dossier « Envoyés » de la boîte (IMAP), comme le ferait une application de messagerie. */
const imapCopy: Copier = async (raw, box, date) => {
  const client = new ImapFlow({
    host: box.imapHost || box.smtpHost,
    port: box.imapPort,
    secure: true,
    auth: { user: box.username, pass: openPassword(box.passwordEnc) },
    logger: false,
  });
  await client.connect();
  try {
    const list = await client.list();
    const sent =
      list.find((m) => m.specialUse === "\\Sent") ?? list.find((m) => /^(inbox[./])?(sent|envoy|éléments envoyés|sent items|sent messages)/i.test(m.path));
    if (!sent) throw new Error("dossier des envoyés introuvable");
    await client.append(sent.path, raw, ["\\Seen"], date);
  } finally {
    await client.logout().catch(() => undefined);
  }
};
/** Gmail et Google Workspace rangent eux-mêmes les envois dans « Envoyés » : pas de seconde copie. */
export const keepsSentCopy = (box: ProspectMailbox) => /(^|\.)(gmail|googlemail)\.com$/i.test(box.smtpHost.trim());
const messageIdFor = (emailId: string, box: ProspectMailbox) => `<${emailId}@${box.address.split("@")[1]}>`;
const fromHeader = (b: ProspectMailbox) => `${b.fromName.replace(/["<>]/g, "")} <${b.address}>`;

// ---------------------------------------------------------------- boîtes

const mailboxSchema = z.object({
  fromName: z.string().trim().min(1).max(100),
  address: z.string().trim().toLowerCase().pipe(z.email().max(200)),
  smtpHost: z.string().trim().min(3).max(200),
  smtpPort: z.coerce.number().int().min(1).max(65535).default(465),
  imapHost: z.string().trim().max(200).optional(),
  imapPort: z.coerce.number().int().min(1).max(65535).default(993),
  username: z.string().trim().max(200).optional(),
  password: z.string().max(500).optional(),
  maxPerDay: z.coerce.number().int().min(1).max(500).default(40),
  rampUp: z.boolean().default(true),
  startedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export async function saveMailbox(input: unknown, id?: string) {
  const d = mailboxSchema.parse(input);
  const startedAt = d.startedAt ? zonedLocalToUtc(`${d.startedAt}T00:00`, FUSEAU) : undefined;
  const common = {
    fromName: d.fromName,
    address: d.address,
    smtpHost: d.smtpHost,
    smtpPort: d.smtpPort,
    username: d.username || d.address,
    imapHost: d.imapHost || null,
    imapPort: d.imapPort,
    maxPerDay: d.maxPerDay,
    rampUp: d.rampUp,
  };
  if (id) {
    return db.prospectMailbox.update({
      where: { id },
      data: { ...common, ...(startedAt ? { startedAt } : {}), ...(d.password ? { passwordEnc: sealPassword(d.password) } : {}) },
    });
  }
  if (!d.password) throw new CoreError("PROSPECTION_PASSWORD_REQUIRED");
  return db.prospectMailbox.create({ data: { ...common, passwordEnc: sealPassword(d.password), ...(startedAt ? { startedAt } : {}) } });
}

/** Désactiver ou supprimer une boîte remet ses e-mails programmés dans la file d'attente. */
async function releaseBox(id: string) {
  await db.prospectEmail.updateMany({ where: { mailboxId: id, status: "PROGRAMME" }, data: { status: "A_ENVOYER", mailboxId: null, scheduledAt: null } });
}
/** Réglage rapide de la limite d'une boîte : maximum par jour et montée en charge progressive ou non. */
export async function setMailboxLimit(id: string, maxPerDay: number, rampUp: boolean) {
  const max = Math.trunc(maxPerDay);
  if (!Number.isFinite(max) || max < 1 || max > 500) throw new CoreError("PROSPECTION_LIMIT_INVALID");
  await db.prospectMailbox.update({ where: { id }, data: { maxPerDay: max, rampUp } });
}

export async function setMailboxActive(id: string, active: boolean) {
  await db.prospectMailbox.update({ where: { id }, data: { active } });
  if (!active) await releaseBox(id);
}
export async function deleteMailbox(id: string) {
  await releaseBox(id);
  await db.prospectMailbox.delete({ where: { id } });
}
export async function testMailbox(id: string) {
  const box = await db.prospectMailbox.findUniqueOrThrow({ where: { id } });
  try {
    await transportFor(box).verify();
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: safeError(err) };
  }
}

export function listMailboxes() {
  return db.prospectMailbox.findMany({ orderBy: { createdAt: "asc" } });
}

/** Capacité du jour de chaque boîte active : montée en charge, moins les e-mails déjà envoyés ou programmés aujourd'hui. */
export async function availability(now = new Date()) {
  const boxes = await db.prospectMailbox.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
  const since = dayStart(now);
  const until = new Date(since.getTime() + DAY);
  const used = await db.prospectEmail.groupBy({
    by: ["mailboxId"],
    where: {
      mailboxId: { in: boxes.map((b) => b.id) },
      OR: [
        { status: "ENVOYE", sentAt: { gte: since, lt: until } },
        { status: "PROGRAMME", scheduledAt: { gte: since, lt: until } },
      ],
    },
    _count: { _all: true },
  });
  const rows = boxes.map((b) => {
    const cap = rampCap(b.startedAt, b.maxPerDay, now, b.rampUp);
    const u = used.find((x) => x.mailboxId === b.id)?._count._all ?? 0;
    return { box: b, cap, used: u, remaining: Math.max(0, cap - u) };
  });
  return { rows, total: rows.reduce((t, r) => t + r.remaining, 0) };
}

// ---------------------------------------------------------------- lots

const emailSchema = z.object({
  id: z.string().trim().min(1).max(80),
  a: z.string().trim().toLowerCase().pipe(z.email().max(200)),
  organisation: z.string().trim().min(1).max(200),
  objet: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(10_000),
  source: z.string().trim().max(500).optional(),
  pourquoi: z.string().trim().max(1000).optional(),
});
const STATUT: Record<string, string> = {
  EXCLU: "exclue",
  PAS_INTERESSE: "pas intéressée",
  CLIENT: "déjà cliente",
  INSCRIT: "déjà inscrite",
  INTERESSE: "déjà en discussion",
  RDV: "déjà en discussion",
  A_RELANCER: "déjà en discussion",
  REPONDU: "déjà en discussion",
};

export type ImportReport = {
  lot: string;
  ajoutes: number;
  misAJour: number;
  programmes: number;
  enAttente: number;
  parBoite: { address: string; count: number }[];
  parJour: { jour: string; count: number }[];
  ignores: { id: string; a: string; raison: string }[];
};

/**
 * Répartit des e-mails à envoyer entre les boîtes actives, au hasard pondéré par la place de chacune ; chaque boîte
 * a son propre rythme (2 à 5 minutes entre deux e-mails). Ce qui dépasse la capacité du jour reste en attente.
 */
/** Plage d'envoi, heure de Belgique : un lot collé le soir part le lendemain matin. */
export const WINDOW = ["08:30", "19:00"] as const;
const localDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU }).format(d);

/**
 * Répartit des e-mails entre les boîtes actives, jour après jour : le jour même tant qu'il reste de la place et que la
 * plage d'envoi est ouverte, puis le lendemain, le surlendemain, etc., selon la capacité de chaque boîte ce jour-là
 * (montée en charge comprise). Au sein d'un jour, chaque e-mail va au hasard à une boîte, pondéré par sa place, et
 * chaque boîte envoie à son rythme (2 à 5 minutes entre deux e-mails).
 */
async function distribute(ids: string[], now: Date, rand: Rand) {
  const boxes = await db.prospectMailbox.findMany({ where: { active: true }, orderBy: { createdAt: "asc" } });
  const [d0, d1] = delay();
  const pending = [...ids];
  const parBoite = new Map<string, number>();
  const parJour = new Map<string, number>();
  for (let k = 0; pending.length > 0 && boxes.length > 0 && k < 90; k++) {
    const jour = localDate(new Date(dayStart(now).getTime() + k * DAY + 12 * 3_600_000));
    const open = zonedLocalToUtc(`${jour}T${WINDOW[0]}`, FUSEAU).getTime();
    const close = zonedLocalToUtc(`${jour}T${WINDOW[1]}`, FUSEAU).getTime();
    const from = k === 0 ? Math.max(now.getTime(), open) : open;
    if (from >= close) continue;
    const since = zonedLocalToUtc(`${jour}T00:00`, FUSEAU);
    const until = zonedLocalToUtc(`${localDate(new Date(since.getTime() + 36 * 3_600_000))}T00:00`, FUSEAU);
    const used = await db.prospectEmail.groupBy({
      by: ["mailboxId"],
      where: {
        mailboxId: { in: boxes.map((b) => b.id) },
        OR: [
          { status: "ENVOYE", sentAt: { gte: since, lt: until } },
          { status: "PROGRAMME", scheduledAt: { gte: since, lt: until } },
        ],
      },
      _count: { _all: true },
    });
    const remaining = new Map(
      boxes.map((b) => [
        b.id,
        Math.max(0, rampCap(b.startedAt, b.maxPerDay, new Date(open), b.rampUp) - (used.find((u) => u.mailboxId === b.id)?._count._all ?? 0)),
      ]),
    );
    const cursor = new Map<string, number>();
    for (const b of boxes) {
      const last = await db.prospectEmail.findFirst({
        where: { mailboxId: b.id, status: "PROGRAMME", scheduledAt: { gte: since, lt: until } },
        orderBy: { scheduledAt: "desc" },
        select: { scheduledAt: true },
      });
      const start = from + (k === 0 ? rand(10, 90) : rand(0, 1800)) * 1000;
      cursor.set(b.id, Math.max(start, last?.scheduledAt ? last.scheduledAt.getTime() + rand(d0, d1) * 1000 : 0));
    }
    while (pending.length > 0) {
      const options = [...remaining].filter(([bid, r]) => r > 0 && cursor.get(bid)! < close);
      if (options.length === 0) break;
      let pick = rand(
        1,
        options.reduce((t, [, r]) => t + r, 0),
      );
      let chosen = options[0]![0];
      for (const [bid, r] of options) {
        pick -= r;
        if (pick <= 0) {
          chosen = bid;
          break;
        }
      }
      const at = cursor.get(chosen)!;
      await db.prospectEmail.update({
        where: { id: pending.shift()! },
        data: { status: "PROGRAMME", mailboxId: chosen, scheduledAt: new Date(at), error: null },
      });
      cursor.set(chosen, at + rand(d0, d1) * 1000);
      remaining.set(chosen, remaining.get(chosen)! - 1);
      parBoite.set(chosen, (parBoite.get(chosen) ?? 0) + 1);
      parJour.set(jour, (parJour.get(jour) ?? 0) + 1);
    }
  }
  return {
    programmes: ids.length - pending.length,
    parBoite: boxes.filter((b) => parBoite.has(b.id)).map((b) => ({ address: b.address, count: parBoite.get(b.id)! })),
    parJour: [...parJour].map(([jour, count]) => ({ jour, count })),
  };
}

/** Import d'un lot : chaque e-mail vérifié un à un, doublons et organisations exclues écartés, puis réparti et programmé aussitôt. */
export async function importLot(raw: unknown, now = new Date(), rand: Rand = defaultRand): Promise<ImportReport> {
  const top = raw as { lot?: unknown; emails?: unknown };
  if (!top || typeof top !== "object" || !Array.isArray(top.emails)) throw new CoreError("PROSPECTION_LOT_INVALID");
  if (top.emails.length > 500) throw new CoreError("PROSPECTION_LOT_TOO_LARGE");
  const lot = (typeof top.lot === "string" && top.lot.trim().slice(0, 60)) || new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU }).format(now);
  const ignores: ImportReport["ignores"] = [];
  const mxCache = new Map<string, Promise<boolean | null>>();
  const created: string[] = [];
  let misAJour = 0;
  for (const item of top.emails) {
    const parsed = emailSchema.safeParse(item);
    const ref = { id: String((item as { id?: unknown })?.id ?? "?"), a: String((item as { a?: unknown })?.a ?? "?") };
    if (!parsed.success) {
      ignores.push({ ...ref, raison: `champ manquant ou invalide : ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}` });
      continue;
    }
    const e = parsed.data;
    const existing = await db.prospectEmail.findUnique({ where: { externalId: e.id }, select: { id: true, status: true } });
    if (existing) {
      // lot recollé : les e-mails pas encore partis reçoivent le nouveau texte, les autres restent intacts
      const updated = await db.prospectEmail.updateMany({
        where: { id: existing.id, status: { in: ["A_ENVOYER", "PROGRAMME"] } },
        data: { subject: e.objet, body: e.message, why: e.pourquoi ?? null, source: e.source ?? null },
      });
      if (updated.count) misAJour++;
      else ignores.push({ id: e.id, a: e.a, raison: existing.status === "ENVOYE" ? "déjà envoyé" : "déjà importé (même identifiant)" });
      continue;
    }
    // adresse qui rebondirait : ignorée, avec sa raison (et l'adresse probable pour un mot collé au domaine)
    const check = await checkAddress(e.a, undefined, mxCache);
    if (!check.ok) {
      ignores.push({ id: e.id, a: e.a, raison: `adresse invalide : ${check.reason}${check.suggestion ? ` (sans doute ${check.suggestion})` : ""}` });
      continue;
    }
    const prospect = await db.prospect.findUnique({ where: { email: e.a }, select: { id: true, status: true } });
    if (prospect && STATUT[prospect.status]) {
      ignores.push({ id: e.id, a: e.a, raison: `organisation ${STATUT[prospect.status]}` });
      continue;
    }
    if (prospect && (await db.prospectEmail.count({ where: { prospectId: prospect.id, status: { in: ["A_ENVOYER", "PROGRAMME", "ENVOYE"] } } }))) {
      ignores.push({ id: e.id, a: e.a, raison: "déjà contactée ou déjà prévue" });
      continue;
    }
    const p = prospect ?? (await db.prospect.create({ data: { email: e.a, organisation: e.organisation, source: e.source ?? null }, select: { id: true } }));
    const row = await db.prospectEmail.create({
      data: { externalId: e.id, lot, prospectId: p.id, toEmail: e.a, subject: e.objet, body: e.message, why: e.pourquoi ?? null, source: e.source ?? null },
      select: { id: true },
    });
    created.push(row.id);
  }
  const d = await distribute(created, now, rand);
  return {
    lot,
    ajoutes: created.length,
    misAJour,
    programmes: d.programmes,
    enAttente: created.length - d.programmes,
    parBoite: d.parBoite,
    parJour: d.parJour,
    ignores,
  };
}

/**
 * Redistribue les e-mails pas encore partis (programmés plus tard, ou en attente) entre les boîtes actives, jour après
 * jour, dans leur ordre d'origine. Appelé à chaque ajout, modification, activation, désactivation ou suppression d'une
 * boîte : une nouvelle boîte avance les envois, une boîte retirée les reporte sur les autres. Les e-mails dus dans la
 * minute ne bougent pas, pour ne jamais croiser un envoi en cours.
 */
export async function rebalance(now = new Date(), rand: Rand = defaultRand) {
  const horizon = new Date(now.getTime() + 60_000);
  const toMove = await db.prospectEmail.findMany({
    where: { OR: [{ status: "PROGRAMME", scheduledAt: { gt: horizon } }, { status: "A_ENVOYER" }] },
    orderBy: [{ scheduledAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    select: { id: true },
  });
  if (toMove.length === 0) return { programmes: 0, enAttente: 0, parBoite: [], parJour: [] };
  const ids = toMove.map((e) => e.id);
  await db.prospectEmail.updateMany({
    where: { id: { in: ids }, status: "PROGRAMME", scheduledAt: { gt: horizon } },
    data: { status: "A_ENVOYER", mailboxId: null, scheduledAt: null },
  });
  const still = new Set((await db.prospectEmail.findMany({ where: { id: { in: ids }, status: "A_ENVOYER" }, select: { id: true } })).map((e) => e.id));
  const ordered = ids.filter((id) => still.has(id));
  const d = await distribute(ordered, now, rand);
  return { ...d, enAttente: ordered.length - d.programmes };
}

/** Programme les e-mails en attente (lots qui dépassaient la capacité d'un jour précédent). */
/** Programme les e-mails en attente (boîte désactivée, aucune boîte active au moment de l'import), sur les prochains jours. */
export async function scheduleWaiting(now = new Date(), rand: Rand = defaultRand) {
  const waiting = await db.prospectEmail.findMany({ where: { status: "A_ENVOYER" }, orderBy: { createdAt: "asc" }, select: { id: true } });
  const d = await distribute(
    waiting.map((w) => w.id),
    now,
    rand,
  );
  return { ...d, enAttente: waiting.length - d.programmes };
}

// ---------------------------------------------------------------- envoi

async function deliver(id: string, now: Date, send: Sender, copy: Copier, from: string[], box: ProspectMailbox) {
  const claimed = await db.prospectEmail.updateMany({
    where: { id, status: { in: from as never } },
    data: { status: "ENVOYE", sentAt: now, mailboxId: box.id, mailbox: box.address, error: null },
  });
  if (claimed.count === 0) return false;
  const e = await db.prospectEmail.findUniqueOrThrow({ where: { id } });
  const out: Outgoing = { from: fromHeader(box), to: e.toEmail, subject: e.subject, text: e.body, messageId: messageIdFor(e.id, box), date: now };
  try {
    await send(out, box);
    await db.$transaction([
      db.prospectEmail.update({ where: { id }, data: { messageId: out.messageId } }),
      db.prospect.update({ where: { id: e.prospectId }, data: { lastContactAt: now } }),
      db.prospect.updateMany({ where: { id: e.prospectId, status: "NOUVEAU" }, data: { status: "CONTACTE" } }),
    ]);
  } catch (err) {
    await db.prospectEmail.update({ where: { id }, data: { status: "ECHEC", sentAt: null, error: safeError(err) } });
    return false;
  }
  try {
    if (!keepsSentCopy(box)) await copy(await buildRaw(out), box, now);
    await db.prospectEmail.update({ where: { id }, data: { copiedAt: new Date() } });
  } catch (err) {
    console.error("copie dans « Envoyés » impossible", box.address, safeError(err)); // rattrapée au prochain passage
  }
  return true;
}

/** Range dans « Envoyés » les e-mails envoyés dont la copie manque (envois antérieurs, ou serveur indisponible au moment de l'envoi). */
export async function fileMissingCopies(copy: Copier = imapCopy, limit = 10) {
  const missing = await db.prospectEmail.findMany({
    where: { status: "ENVOYE", copiedAt: null, box: { isNot: null } },
    include: { box: true },
    orderBy: { sentAt: "asc" },
    take: limit,
  });
  let filed = 0;
  for (const e of missing) {
    const box = e.box!;
    const out: Outgoing = {
      from: fromHeader(box),
      to: e.toEmail,
      subject: e.subject,
      text: e.body,
      messageId: e.messageId ?? messageIdFor(e.id, box),
      date: e.sentAt ?? new Date(),
    };
    try {
      if (!keepsSentCopy(box)) await copy(await buildRaw(out), box, out.date);
      await db.prospectEmail.update({ where: { id: e.id }, data: { copiedAt: new Date() } });
      filed++;
    } catch (err) {
      console.error("copie dans « Envoyés » impossible", box.address, safeError(err));
      break; // serveur indisponible : on réessaiera au prochain passage
    }
  }
  return filed;
}

const sentToday = (boxId: string, now: Date) => db.prospectEmail.count({ where: { mailboxId: boxId, status: "ENVOYE", sentAt: { gte: dayStart(now) } } });

/** Tâche planifiée, chaque minute : pour chaque boîte, l'e-mail programmé le plus ancien qui est dû, dans sa limite du jour. */
export async function sendDueProspectEmails(now = new Date(), send: Sender = smtpSend, copy: Copier = imapCopy) {
  const boxes = await db.prospectMailbox.findMany({ where: { active: true } });
  let sent = 0;
  for (const b of boxes) {
    const due = await db.prospectEmail.findFirst({
      where: { mailboxId: b.id, status: "PROGRAMME", scheduledAt: { lte: now } },
      orderBy: { scheduledAt: "asc" },
      select: { id: true },
    });
    if (!due || (await sentToday(b.id, now)) >= rampCap(b.startedAt, b.maxPerDay, now, b.rampUp)) continue;
    if (await deliver(due.id, now, send, copy, ["PROGRAMME"], b)) sent++;
  }
  const filed = await fileMissingCopies(copy);
  return { sent, filed };
}

/** « Envoyer maintenant » : par sa boîte si elle a encore de la place, sinon par une boîte qui en a. */
export async function sendNow(id: string, now = new Date(), send: Sender = smtpSend, copy: Copier = imapCopy, rand: Rand = defaultRand) {
  const e = await db.prospectEmail.findUniqueOrThrow({ where: { id }, select: { mailboxId: true } });
  const { rows } = await availability(now);
  if (rows.length === 0) throw new CoreError("PROSPECTION_NOT_CONFIGURED");
  const own = rows.find((r) => r.box.id === e.mailboxId && (r.remaining > 0 || r.cap - (r.used - 1) > 0));
  const free = rows.filter((r) => r.remaining > 0);
  const row = own ?? free[rand(0, Math.max(0, free.length - 1))];
  if (!row) throw new CoreError("PROSPECTION_DAILY_CAP");
  if (!(await deliver(id, now, send, copy, ["A_ENVOYER", "PROGRAMME", "ECHEC"], row.box))) throw new CoreError("PROSPECTION_SEND_FAILED");
}

/** « M'envoyer un test » : un e-mail court depuis la boîte, à elle-même ou à l'adresse donnée (par exemple celle de mail-tester.com). */
export async function sendTest(boxId: string, to?: string, send: Sender = smtpSend, copy: Copier = imapCopy) {
  const box = await db.prospectMailbox.findUniqueOrThrow({ where: { id: boxId } });
  const dest = (to?.trim() || box.address).toLowerCase();
  if (!z.email().safeParse(dest).success) return { ok: false as const, error: "adresse de test invalide" };
  const now = new Date();
  const out: Outgoing = {
    from: fromHeader(box),
    to: dest,
    subject: "Test d'envoi de la prospection Evoly",
    text: `Bonjour,\n\nCe message de test part de ${box.address}, par le serveur ${box.smtpHost}. S'il t'arrive, l'envoi fonctionne.\n\nEvoly`,
    messageId: `<test-${now.getTime()}@${box.address.split("@")[1]}>`,
    date: now,
  };
  try {
    await send(out, box);
  } catch (err) {
    return { ok: false as const, error: safeError(err) };
  }
  try {
    if (!keepsSentCopy(box)) await copy(await buildRaw(out), box, now);
    return { ok: true as const, copied: true };
  } catch (err) {
    return { ok: true as const, copied: false, error: safeError(err) };
  }
}

export async function withdrawEmail(id: string) {
  await db.prospectEmail.updateMany({ where: { id, status: { in: ["A_ENVOYER", "PROGRAMME", "ECHEC"] } }, data: { status: "RETIRE", scheduledAt: null } });
}

export async function retryEmail(id: string) {
  await db.prospectEmail.updateMany({ where: { id, status: "ECHEC" }, data: { status: "A_ENVOYER", mailboxId: null, error: null } });
}

export const PROSPECT_STATUTS = [
  ["NOUVEAU", "Nouveau"],
  ["CONTACTE", "Contacté, en attente de réponse"],
  ["REPONDU", "A répondu, à qualifier"],
  ["INTERESSE", "Intéressé"],
  ["RDV", "Démo ou rendez-vous prévu"],
  ["A_RELANCER", "Plus tard, à relancer"],
  ["INSCRIT", "Compte créé"],
  ["CLIENT", "Client"],
  ["PAS_INTERESSE", "Pas intéressé"],
  ["EXCLU", "Ne plus contacter"],
] as const;
export type ProspectStatut = (typeof PROSPECT_STATUTS)[number][0];
const LIBELLE = Object.fromEntries(PROSPECT_STATUTS) as Record<string, string>;
const REPONSES = new Set(["REPONDU", "INTERESSE", "RDV", "A_RELANCER", "INSCRIT", "CLIENT", "PAS_INTERESSE"]);
const jourFr = (d: Date) => new Intl.DateTimeFormat("fr-BE", { timeZone: FUSEAU, day: "numeric", month: "long", year: "numeric" }).format(d);

/** Mise à jour du suivi d'un prospect ; chaque changement est inscrit dans son historique. */
export async function updateProspect(id: string, data: { status?: string; notes?: string; nextActionAt?: string | null }, now = new Date()) {
  const p = await db.prospect.findUniqueOrThrow({ where: { id } });
  const patch: { status?: ProspectStatut; notes?: string | null; nextActionAt?: Date | null; respondedAt?: Date } = {};
  const log: string[] = [];
  if (data.status !== undefined) {
    const status = z.enum(PROSPECT_STATUTS.map(([k]) => k) as [ProspectStatut, ...ProspectStatut[]]).parse(data.status);
    if (status !== p.status) {
      patch.status = status;
      log.push(`Statut : ${LIBELLE[p.status] ?? p.status} → ${LIBELLE[status]}`);
      if (REPONSES.has(status) && !p.respondedAt) patch.respondedAt = now;
    }
  }
  if (data.notes !== undefined) {
    const notes = data.notes.trim().slice(0, 4000) || null;
    if (notes !== p.notes) {
      patch.notes = notes;
      log.push(notes ? "Note modifiée" : "Note effacée");
    }
  }
  if (data.nextActionAt !== undefined) {
    const at = data.nextActionAt && /^\d{4}-\d{2}-\d{2}$/.test(data.nextActionAt) ? zonedLocalToUtc(`${data.nextActionAt}T09:00`, FUSEAU) : null;
    if ((at?.getTime() ?? null) !== (p.nextActionAt?.getTime() ?? null)) {
      patch.nextActionAt = at;
      log.push(at ? `Relance prévue le ${jourFr(at)}` : "Relance retirée");
    }
  }
  if (log.length === 0) return;
  await db.$transaction([
    db.prospect.update({ where: { id }, data: patch }),
    ...log.map((label) => db.prospectActivity.create({ data: { prospectId: id, label, createdAt: now } })),
  ]);
  if (patch.status === "EXCLU" || patch.status === "PAS_INTERESSE")
    await db.prospectEmail.updateMany({ where: { prospectId: id, status: { in: ["A_ENVOYER", "PROGRAMME"] } }, data: { status: "RETIRE", scheduledAt: null } });
}

// ---------------------------------------------------------------- vues

export async function prospectionOverview(now = new Date()) {
  const [avail, byStatus, lots, next] = await Promise.all([
    availability(now),
    db.prospectEmail.groupBy({ by: ["status"], _count: { _all: true } }),
    db.prospectEmail.groupBy({ by: ["lot"], _count: { _all: true }, _max: { createdAt: true }, orderBy: { _max: { createdAt: "desc" } }, take: 12 }),
    db.prospectEmail.findFirst({ where: { status: "PROGRAMME" }, orderBy: { scheduledAt: "asc" }, select: { scheduledAt: true } }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const since = dayStart(now);
  const sentByBox = await db.prospectEmail.groupBy({ by: ["mailboxId"], where: { status: "ENVOYE", sentAt: { gte: since } }, _count: { _all: true } });
  return {
    disponibles: avail.total,
    plageTerminee: now.getTime() >= zonedLocalToUtc(`${localDate(now)}T${WINDOW[1]}`, FUSEAU).getTime(),
    plage: WINDOW,
    boites: avail.rows.map((r) => ({
      id: r.box.id,
      address: r.box.address,
      cap: r.cap,
      envoyes: sentByBox.find((s) => s.mailboxId === r.box.id)?._count._all ?? 0,
      restants: r.remaining,
    })),
    delay: delay(),
    aEnvoyer: count("A_ENVOYER"),
    programmes: count("PROGRAMME"),
    echecs: count("ECHEC"),
    envoyes: count("ENVOYE"),
    prochain: next?.scheduledAt ?? null,
    lots: lots.map((l) => ({ lot: l.lot, total: l._count._all })),
  };
}

export function lotEmails(lot: string) {
  return db.prospectEmail.findMany({
    where: { lot },
    orderBy: { scheduledAt: "asc" },
    include: { prospect: { select: { organisation: true, status: true } }, box: { select: { address: true } } },
  });
}

export function listProspects(q?: string, status?: string, aRelancer = false, now = new Date()) {
  const finDuJour = new Date(dayStart(now).getTime() + DAY);
  return db.prospect.findMany({
    where: {
      ...(q
        ? {
            OR: [
              { organisation: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { notes: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(status ? { status: status as ProspectStatut } : {}),
      ...(aRelancer ? { nextActionAt: { lt: finDuJour } } : {}),
    },
    orderBy: aRelancer ? { nextActionAt: "asc" } : { updatedAt: "desc" },
    take: 300,
    include: { _count: { select: { emails: true } } },
  });
}

/** Fiche d'un prospect : e-mails et historique. */
export function prospectDetail(id: string) {
  return db.prospect.findUnique({
    where: { id },
    include: {
      emails: { orderBy: { createdAt: "asc" }, include: { box: { select: { address: true } } } },
      activities: { orderBy: { createdAt: "desc" }, take: 100 },
    },
  });
}

/** Chiffres du suivi : contactés, réponses, intéressés, démos, comptes, clients, relances du jour. */
export async function pipelineStats(now = new Date()) {
  const finDuJour = new Date(dayStart(now).getTime() + DAY);
  const [parStatut, contactes, aRelancer] = await Promise.all([
    db.prospect.groupBy({ by: ["status"], _count: { _all: true } }),
    db.prospect.count({ where: { emails: { some: { status: "ENVOYE" } } } }),
    db.prospect.count({ where: { nextActionAt: { lt: finDuJour }, status: { notIn: ["EXCLU", "PAS_INTERESSE", "CLIENT"] } } }),
  ]);
  const n = (s: string) => parStatut.find((x) => x.status === s)?._count._all ?? 0;
  const reponses = [...REPONSES].reduce((t, s) => t + n(s), 0);
  return {
    contactes,
    reponses,
    tauxReponse: contactes ? Math.round((reponses / contactes) * 100) : 0,
    interesses: n("INTERESSE") + n("RDV"),
    rdv: n("RDV"),
    inscrits: n("INSCRIT"),
    clients: n("CLIENT"),
    pasInteresses: n("PAS_INTERESSE"),
    aRelancer,
    parStatut: Object.fromEntries(PROSPECT_STATUTS.map(([k]) => [k, n(k)])),
  };
}

/** Export de la liste des prospects (CSV, séparateur point-virgule, lisible par Excel). */
export async function prospectsCsv() {
  const rows = await db.prospect.findMany({ orderBy: { updatedAt: "desc" }, include: { _count: { select: { emails: true } } } });
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const d = (x: Date | null) => (x ? new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU }).format(x) : "");
  const lines = [["Organisation", "E-mail", "Statut", "Dernier contact", "Première réponse", "Relance", "E-mails", "Notes", "Source"].map(cell).join(";")];
  for (const p of rows)
    lines.push(
      [p.organisation, p.email, LIBELLE[p.status] ?? p.status, d(p.lastContactAt), d(p.respondedAt), d(p.nextActionAt), p._count.emails, p.notes, p.source]
        .map(cell)
        .join(";"),
    );
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

/**
 * Vérifie les adresses des e-mails pas encore partis : une adresse invalide voit son e-mail retiré et son prospect écarté,
 * avec la raison en note (et l'adresse probable pour un mot collé au domaine, à corriger à la main).
 */
export async function cleanPendingAddresses(
  check: (a: string) => Promise<import("./emailCheck").AddressCheck> = (() => {
    const cache = new Map<string, Promise<boolean | null>>();
    return (a: string) => checkAddress(a, undefined, cache);
  })(),
  only: { lot?: string } = {},
) {
  const pending = await db.prospectEmail.findMany({
    where: { status: { in: ["A_ENVOYER", "PROGRAMME"] }, ...(only.lot ? { lot: only.lot } : {}) },
    select: { id: true, toEmail: true, prospectId: true },
  });
  const ecartees: { a: string; raison: string; suggestion?: string }[] = [];
  for (const em of pending) {
    const c = await check(em.toEmail);
    if (c.ok) continue;
    await withdrawEmail(em.id);
    const p = await db.prospect.findUnique({ where: { id: em.prospectId }, select: { notes: true } });
    const note = `Adresse invalide : ${c.reason}${c.suggestion ? ` (sans doute ${c.suggestion})` : ""}.`;
    await db.prospect.update({ where: { id: em.prospectId }, data: { status: "EXCLU", notes: p?.notes ? `${p.notes}\n${note}` : note } });
    ecartees.push({ a: em.toEmail, raison: c.reason, ...(c.suggestion ? { suggestion: c.suggestion } : {}) });
  }
  return { verifiees: pending.length, ecartees };
}
