import { CoreError } from "@evoly/core";
import { db } from "@/lib/db";
import { readRows } from "./importFile";
import {
  PROSPECT_STATUTS,
  type ProspectStatut,
  updateProspect,
} from "./prospection";

/**
 * Import des réponses des prospects (CSV ou Excel), préparé depuis les e-mails
 * reçus : réponses positives, négatives, messages non livrés, réponses
 * automatiques. Chaque ligne : l'adresse du prospect, son nouveau statut (vide :
 * une note seulement), la date de la réponse, une note, une date de relance.
 * Aperçu d'abord, puis application avec les règles de la fiche du prospect.
 */
export type ReplyAction =
  "change" | "note" | "same" | "protected" | "unknown" | "invalid";
export interface ReplyRow {
  line: number;
  email: string;
  organisation: string | null;
  current: ProspectStatut | null;
  next: ProspectStatut | null;
  action: ReplyAction;
  /** Statut protégé (CLIENT, INSCRIT, EXCLU), ou cause d'une ligne invalide (EMAIL, STATUS). */
  reason?: string;
  note: string | null;
  date: string | null;
  followUp: string | null;
}

const MAX_BYTES = 2_000_000;
const MAX_ROWS = 5_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const plain = (v: string) =>
  v
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const HEADERS: Record<
  "email" | "status" | "date" | "note" | "followUp",
  string[]
> = {
  email: [
    "email",
    "e mail",
    "adresse",
    "adresse e mail",
    "mail",
    "courriel",
    "destinataire",
    "prospect",
  ],
  status: ["statut", "status", "nouveau statut", "etat"],
  date: ["date", "date de reponse", "recu le", "date de reception"],
  note: ["note", "notes", "resume", "commentaire", "reponse", "raison"],
  followUp: [
    "relance",
    "a relancer le",
    "date de relance",
    "prochaine action",
    "next action",
  ],
};

/** Statut d'après le fichier : le code, le libellé de l'interface ou un mot courant ; vide : aucun changement. */
const WORDS: Record<string, ProspectStatut | null> = (() => {
  const m: Record<string, ProspectStatut | null> = {};
  for (const [k, label] of PROSPECT_STATUTS) {
    m[plain(k)] = k;
    m[plain(label)] = k;
  }
  Object.assign(m, {
    interessee: "INTERESSE",
    positif: "INTERESSE",
    positive: "INTERESSE",
    rdv: "RDV",
    "rendez vous": "RDV",
    demo: "RDV",
    "pas interessee": "PAS_INTERESSE",
    negatif: "PAS_INTERESSE",
    negative: "PAS_INTERESSE",
    exclue: "EXCLU",
    "non livre": "EXCLU",
    bounce: "EXCLU",
    "ne plus contacter": "EXCLU",
    desinscrit: "EXCLU",
    repondu: "REPONDU",
    "a relancer": "A_RELANCER",
    "plus tard": "A_RELANCER",
    "compte cree": "INSCRIT",
    aucun: null,
    inchange: null,
    "reponse automatique": null,
    absence: null,
  });
  return m;
})();
/** Jamais rétrogradés par un import ; « ne plus contacter » le reste. */
const KEEP: ReadonlySet<ProspectStatut> = new Set(["CLIENT", "INSCRIT"]);

/** Date du fichier : AAAA-MM-JJ ou JJ/MM/AAAA (heure ignorée) ; sinon aucune. */
function dayOf(raw: string | undefined): string | null {
  const v = (raw ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(v);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return null;
}

/** Aperçu : chaque ligne, son prospect et son effet, sans rien enregistrer. */
export async function planReplies(file: { name: string; bytes: Uint8Array }) {
  if (file.bytes.length > MAX_BYTES)
    throw new CoreError("REPLIES_FILE_TOO_LARGE");
  const { rows } = readRows(file.bytes, file.name);
  const head = (rows[0] ?? []).map((c) => plain(c));
  const col = Object.fromEntries(
    Object.entries(HEADERS).map(([k, names]) => [
      k,
      head.findIndex((h) => names.includes(h)),
    ]),
  ) as Record<keyof typeof HEADERS, number>;
  if (col.email < 0) throw new CoreError("REPLIES_NO_EMAIL_COLUMN");
  const body = rows.slice(1, MAX_ROWS + 1);
  const cell = (r: string[], i: number) => (i >= 0 ? (r[i] ?? "").trim() : "");
  const emails = [
    ...new Set(
      body
        .map((r) => cell(r, col.email).toLowerCase())
        .filter((e) => EMAIL.test(e)),
    ),
  ];
  const found = await db.prospect.findMany({
    where: { email: { in: emails, mode: "insensitive" } },
    select: { id: true, email: true, organisation: true, status: true },
  });
  const byEmail = new Map(found.map((p) => [p.email.toLowerCase(), p]));
  const state = new Map(
    found.map((p) => [p.email.toLowerCase(), p.status as ProspectStatut]),
  );
  const out: ReplyRow[] = [];
  body.forEach((r, i) => {
    const line = i + 2;
    const email = cell(r, col.email).toLowerCase();
    if (!email && r.every((c) => !c.trim())) return; // ligne vide
    const rawStatus = cell(r, col.status);
    const note = cell(r, col.note).slice(0, 1000) || null;
    const date = dayOf(cell(r, col.date));
    const followUp = dayOf(cell(r, col.followUp));
    const base = { line, email, note, date, followUp };
    if (!EMAIL.test(email))
      return void out.push({
        ...base,
        organisation: null,
        current: null,
        next: null,
        action: "invalid",
        reason: "EMAIL",
      });
    const key = plain(rawStatus);
    if (key && !(key in WORDS))
      return void out.push({
        ...base,
        organisation: null,
        current: null,
        next: null,
        action: "invalid",
        reason: "STATUS",
      });
    const next = key ? WORDS[key]! : null;
    const p = byEmail.get(email);
    if (!p)
      return void out.push({
        ...base,
        organisation: null,
        current: null,
        next,
        action: "unknown",
      });
    const current = state.get(email)!;
    let action: ReplyAction;
    let reason: string | undefined;
    if (
      next &&
      next !== current &&
      (KEEP.has(current) || current === "EXCLU")
    ) {
      action = "protected";
      reason = current;
    } else if (next && next !== current) {
      action = "change";
      state.set(email, next); // les lignes suivantes du même prospect partent de ce statut
    } else action = note || followUp ? "note" : "same";
    out.push({
      ...base,
      organisation: p.organisation,
      current,
      next,
      action,
      reason,
    });
  });
  const counts = {
    change: 0,
    note: 0,
    same: 0,
    protected: 0,
    unknown: 0,
    invalid: 0,
  } as Record<ReplyAction, number>;
  for (const r of out) counts[r.action]++;
  return { rows: out, counts };
}

const FUSEAU = "Europe/Brussels";
const jour = (d: string) =>
  new Intl.DateTimeFormat("fr-BE", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${d}T12:00:00Z`));

/**
 * Applique le fichier : les statuts (règles de la fiche du prospect : historique,
 * date de première réponse, messages en attente retirés pour « pas intéressé »
 * ou « ne plus contacter »), les notes ajoutées à la suite, les relances. La
 * date de chaque réponse sert de date à son historique. Le fichier est relu :
 * l'aperçu n'est jamais pris tel quel.
 */
export async function applyReplies(
  file: { name: string; bytes: Uint8Array },
  now = new Date(),
) {
  const { rows, counts } = await planReplies(file);
  const ids = new Map(
    (
      await db.prospect.findMany({
        where: {
          email: {
            in: rows.filter((r) => r.organisation !== null).map((r) => r.email),
            mode: "insensitive",
          },
        },
        select: { id: true, email: true },
      })
    ).map((p) => [p.email.toLowerCase(), p.id]),
  );
  for (const r of rows) {
    const id = ids.get(r.email);
    if (
      !id ||
      r.action === "unknown" ||
      r.action === "invalid" ||
      r.action === "same"
    )
      continue;
    const at =
      r.date && new Date(`${r.date}T12:00:00Z`) <= now
        ? new Date(`${r.date}T12:00:00Z`)
        : now;
    await updateProspect(
      id,
      {
        ...(r.action === "change" ? { status: r.next! } : {}),
        ...(r.followUp ? { nextActionAt: r.followUp } : {}),
      },
      at,
    );
    if (r.note) {
      const p = await db.prospect.findUniqueOrThrow({
        where: { id },
        select: { notes: true },
      });
      const line = `${r.date ? jour(r.date) : "Réponse"} : ${r.note}`;
      await db.$transaction([
        db.prospect.update({
          where: { id },
          data: {
            notes: (p.notes ? `${p.notes}\n${line}` : line).slice(-4000),
          },
        }),
        db.prospectActivity.create({
          data: {
            prospectId: id,
            label: `Réponse importée : ${r.note.slice(0, 200)}`,
            createdAt: at,
          },
        }),
      ]);
    }
  }
  return { counts, fuseau: FUSEAU };
}
