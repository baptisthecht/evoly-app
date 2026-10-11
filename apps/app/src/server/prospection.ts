import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from "node:crypto";
import { CoreError, zonedLocalToUtc } from "@evoly/core";
import type { ProspectMailbox } from "@evoly/db";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";
import { z } from "zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { safeError } from "@/lib/redact";

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
export function rampCap(startedAt: Date, maxPerDay: number, now: Date) {
  const days = Math.round((dayStart(now).getTime() - dayStart(startedAt).getTime()) / DAY);
  if (days < 0) return 0;
  return Math.min(days < 7 ? 15 : days < 14 ? 25 : maxPerDay, maxPerDay);
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

const transports = new Map<string, { at: number; t: nodemailer.Transporter }>();
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
    const cap = rampCap(b.startedAt, b.maxPerDay, now);
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
const STATUT: Record<string, string> = { EXCLU: "exclue", PAS_INTERESSE: "pas intéressée", CLIENT: "déjà cliente" };

export type ImportReport = {
  lot: string;
  ajoutes: number;
  programmes: number;
  enAttente: number;
  parBoite: { address: string; count: number }[];
  ignores: { id: string; a: string; raison: string }[];
};

/**
 * Répartit des e-mails à envoyer entre les boîtes actives, au hasard pondéré par la place de chacune ; chaque boîte
 * a son propre rythme (2 à 5 minutes entre deux e-mails). Ce qui dépasse la capacité du jour reste en attente.
 */
async function distribute(ids: string[], now: Date, rand: Rand) {
  const { rows } = await availability(now);
  const [d0, d1] = delay();
  const until = dayStart(now).getTime() + DAY;
  const remaining = new Map(rows.map((r) => [r.box.id, r.remaining]));
  const cursor = new Map<string, number>();
  for (const r of rows) {
    const last = await db.prospectEmail.findFirst({
      where: { mailboxId: r.box.id, status: "PROGRAMME" },
      orderBy: { scheduledAt: "desc" },
      select: { scheduledAt: true },
    });
    cursor.set(r.box.id, Math.max(now.getTime() + rand(10, 90) * 1000, last?.scheduledAt ? last.scheduledAt.getTime() + rand(d0, d1) * 1000 : 0));
  }
  const parBoite = new Map<string, number>();
  let programmes = 0;
  for (const id of ids) {
    const options = [...remaining].filter(([bid, r]) => r > 0 && cursor.get(bid)! < until);
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
    await db.prospectEmail.update({ where: { id }, data: { status: "PROGRAMME", mailboxId: chosen, scheduledAt: new Date(at), error: null } });
    cursor.set(chosen, at + rand(d0, d1) * 1000);
    remaining.set(chosen, remaining.get(chosen)! - 1);
    parBoite.set(chosen, (parBoite.get(chosen) ?? 0) + 1);
    programmes++;
  }
  return { programmes, parBoite: rows.filter((r) => parBoite.has(r.box.id)).map((r) => ({ address: r.box.address, count: parBoite.get(r.box.id)! })) };
}

/** Import d'un lot : chaque e-mail vérifié un à un, doublons et organisations exclues écartés, puis réparti et programmé aussitôt. */
export async function importLot(raw: unknown, now = new Date(), rand: Rand = defaultRand): Promise<ImportReport> {
  const top = raw as { lot?: unknown; emails?: unknown };
  if (!top || typeof top !== "object" || !Array.isArray(top.emails)) throw new CoreError("PROSPECTION_LOT_INVALID");
  if (top.emails.length > 500) throw new CoreError("PROSPECTION_LOT_TOO_LARGE");
  const lot = (typeof top.lot === "string" && top.lot.trim().slice(0, 60)) || new Intl.DateTimeFormat("en-CA", { timeZone: FUSEAU }).format(now);
  const ignores: ImportReport["ignores"] = [];
  const created: string[] = [];
  for (const item of top.emails) {
    const parsed = emailSchema.safeParse(item);
    const ref = { id: String((item as { id?: unknown })?.id ?? "?"), a: String((item as { a?: unknown })?.a ?? "?") };
    if (!parsed.success) {
      ignores.push({ ...ref, raison: `champ manquant ou invalide : ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}` });
      continue;
    }
    const e = parsed.data;
    if (await db.prospectEmail.findUnique({ where: { externalId: e.id }, select: { id: true } })) {
      ignores.push({ id: e.id, a: e.a, raison: "déjà importé (même identifiant)" });
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
  return { lot, ajoutes: created.length, programmes: d.programmes, enAttente: created.length - d.programmes, parBoite: d.parBoite, ignores };
}

/** Programme les e-mails en attente (lots qui dépassaient la capacité d'un jour précédent). */
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
    await copy(await buildRaw(out), box, now);
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
      await copy(await buildRaw(out), box, out.date);
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
    if (!due || (await sentToday(b.id, now)) >= rampCap(b.startedAt, b.maxPerDay, now)) continue;
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
    await copy(await buildRaw(out), box, now);
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

export async function updateProspect(id: string, data: { status: string; notes: string }) {
  const status = z.enum(["NOUVEAU", "CONTACTE", "REPONDU", "CLIENT", "PAS_INTERESSE", "EXCLU"]).parse(data.status);
  await db.prospect.update({ where: { id }, data: { status, notes: data.notes.trim().slice(0, 2000) || null } });
  if (status === "EXCLU" || status === "PAS_INTERESSE")
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
