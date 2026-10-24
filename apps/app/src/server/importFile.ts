import { unzipSync } from "fflate";
import { CoreError } from "@evoly/core";

// Lecture des fichiers de billets des réseaux (docs/COMPATIBILITE_RESEAUX.md) : CSV et Excel (.xlsx), sans dépendance
// supplémentaire ; puis reconnaissance des colonnes, en-têtes en français et en anglais, avec ou sans en-tête.

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 20_000;
const MAX_XLSX_UNZIPPED = 60 * 1024 * 1024; // archive piégée : refusée bien avant d'épuiser la mémoire

/** Tableau de cellules (texte), lignes entièrement vides retirées. */
export function readTable(bytes: Uint8Array, filename: string): string[][] {
  return readRows(bytes, filename).rows;
}

/** Lignes non vides et leur numéro dans le fichier (1 = première ligne), pour signaler la bonne ligne à l'organisateur. */
export function readRows(
  bytes: Uint8Array,
  filename: string,
): { rows: string[][]; lines: number[] } {
  if (bytes.byteLength === 0) throw new CoreError("IMPORT_FILE_EMPTY");
  if (bytes.byteLength > MAX_IMPORT_BYTES)
    throw new CoreError("IMPORT_FILE_TOO_LARGE");
  const name = filename.toLowerCase();
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b; // « PK » : archive, donc Excel moderne
  if (name.endsWith(".xls") && !zip)
    throw new CoreError("IMPORT_FILE_OLD_EXCEL");
  const rows = zip ? readXlsx(bytes) : readCsv(decodeText(bytes));
  const cleaned = rows.map((r) =>
    r.map((c) => c.replace(/\u00a0/g, " ").trim()),
  );
  const lines = cleaned
    .map((_, i) => i + 1)
    .filter((_, i) => cleaned[i]!.some((c) => c !== ""));
  const kept = lines.map((n) => cleaned[n - 1]!);
  if (kept.length === 0) throw new CoreError("IMPORT_FILE_EMPTY");
  if (kept.length > MAX_IMPORT_ROWS + 1)
    throw new CoreError("IMPORT_FILE_TOO_LARGE");
  return { rows: kept, lines };
}

// ─── CSV ────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** UTF-8, sinon Windows-1252 (CSV enregistré par Excel en français : « é » en un seul octet). */
export function decodeText(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const text = utf8.includes("\ufffd")
    ? new TextDecoder("windows-1252").decode(bytes)
    : utf8;
  return text.replace(/^\ufeff/, "");
}

const SEPARATORS = [";", ",", "\t", "|"] as const;

/**
 * Séparateur le plus régulier sur les premiers enregistrements, hors guillemets. Les enregistrements suivent les guillemets
 * d'une ligne à l'autre : un retour à la ligne dans une cellule entre guillemets ne coupe pas l'enregistrement.
 */
function guessSeparator(text: string): string {
  const sample = text.slice(0, 20_000);
  let best: string = ";";
  let bestScore = -1;
  for (const sep of SEPARATORS) {
    const counts: number[] = [];
    let n = 0;
    let quoted = false;
    for (let i = 0; i < sample.length && counts.length < 20; i++) {
      const ch = sample[i]!;
      if (ch === '"') quoted = !quoted;
      else if (!quoted && ch === sep) n++;
      else if (!quoted && (ch === "\n" || ch === "\r")) {
        if (ch === "\r" && sample[i + 1] === "\n") i++;
        counts.push(n);
        n = 0;
      }
    }
    if (n > 0 || counts.length === 0) counts.push(n);
    const filled = counts.filter((c, k) => c > 0 || k === 0);
    const min = Math.min(...filled);
    const score =
      min > 0 ? min * 1000 + filled.filter((c) => c === filled[0]).length : 0;
    if (score > bestScore) {
      best = sep;
      bestScore = score;
    }
  }
  return best;
}

/** CSV selon la RFC 4180 : guillemets, guillemets doublés, retours à la ligne dans une cellule entre guillemets. */
export function readCsv(
  text: string,
  separator = guessSeparator(text),
): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === separator) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ─── Excel (.xlsx) ──────────────────────────────────────────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};
const xmlText = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#"
      ? String.fromCodePoint(
          e[1] === "x" || e[1] === "X"
            ? Number.parseInt(e.slice(2), 16)
            : Number(e.slice(1)),
        )
      : (ENTITIES[e.toLowerCase()] ?? ""),
  );
/** Texte d'un élément partagé ou en ligne : toutes ses balises <t>, texte enrichi compris. */
const runsText = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
    .map((m) => xmlText(m[1]!))
    .join("");
const columnIndex = (ref: string) =>
  [...ref.replace(/\d+/g, "")].reduce(
    (n, ch) => n * 26 + (ch.toUpperCase().charCodeAt(0) - 64),
    0,
  ) - 1;

/** Nombre d'Excel en texte : entier sans exposant quand c'est possible (codes-barres saisis comme nombres). */
function numberText(raw: string): string {
  if (!/e/i.test(raw)) return raw;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? String(n) : raw;
}

export function readXlsx(bytes: Uint8Array): string[][] {
  let total = 0;
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_XLSX_UNZIPPED)
          throw new CoreError("IMPORT_FILE_TOO_LARGE");
        return (
          f.name === "xl/workbook.xml" ||
          f.name === "xl/_rels/workbook.xml.rels" ||
          f.name === "xl/sharedStrings.xml" ||
          /^xl\/worksheets\/[^/]+\.xml$/.test(f.name)
        );
      },
    });
  } catch (e) {
    if (e instanceof CoreError) throw e;
    throw new CoreError("IMPORT_FILE_UNREADABLE");
  }
  const text = (name: string) =>
    files[name] ? new TextDecoder().decode(files[name]) : "";
  // première feuille du classeur, par son lien
  const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(
    text("xl/workbook.xml"),
  )?.[1];
  const target = rid
    ? new RegExp(
        `<Relationship\\b[^>]*\\bId="${rid}"[^>]*\\bTarget="([^"]+)"`,
      ).exec(text("xl/_rels/workbook.xml.rels"))?.[1]
    : undefined;
  const sheetName = target
    ? `xl/${target.replace(/^\/?xl\//, "").replace(/^\//, "")}`
    : Object.keys(files).find((n) => n.startsWith("xl/worksheets/"));
  const sheet = sheetName ? text(sheetName) : "";
  if (!sheet) throw new CoreError("IMPORT_FILE_UNREADABLE");
  const shared = [
    ...text("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g),
  ].map((m) => runsText(m[1]!));
  const rows: string[][] = [];
  for (const r of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const c of r[1]!.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!;
      const inner = c[2] ?? "";
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      const value =
        type === "s"
          ? (shared[Number(v)] ?? "")
          : type === "inlineStr"
            ? runsText(inner)
            : type === "str" || type === "e"
              ? xmlText(v ?? "")
              : type === "b"
                ? v === "1"
                  ? "VRAI"
                  : "FAUX"
                : v != null
                  ? numberText(v)
                  : "";
      const index = ref ? columnIndex(ref) : row.length;
      while (row.length < index) row.push("");
      row[index] = value;
    }
    rows.push(row);
  }
  return rows;
}

// ─── Reconnaissance des colonnes ────────────────────────────────────────────────────────────────────────────────────

import { IMPORT_FIELDS, type ImportField } from "@/lib/importFields";

export { IMPORT_FIELDS, type ImportField };
export type ColumnMap = Partial<Record<ImportField, number>>;

const plain = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[°º#.:_\-/()]/g, " ")
    .replace(/\bno?\b|\bnum(ero)?\b|\bn\b/g, "numero")
    .replace(/\s+/g, " ")
    .trim();

/** En-têtes reconnus (comparés sans accents ni ponctuation) ; le premier qui correspond l'emporte. */
const SYNONYMS: Array<[ImportField, string[]]> = [
  [
    "code",
    [
      "code barre",
      "code barres",
      "codebarre",
      "barcode",
      "bar code",
      "ean",
      "qr code",
      "code billet",
      "numero billet",
      "numero de billet",
      "ticket number",
      "ticket id",
      "code",
      "contremarque",
      "numero contremarque",
      "numero de contremarque",
      "e ticket",
      "eticket",
    ],
  ],
  [
    "reservation",
    [
      "numero reservation",
      "numero de reservation",
      "reservation",
      "reference reservation",
      "numero commande",
      "numero de commande",
      "commande",
      "reference",
      "order",
      "order id",
      "order number",
      "booking",
      "booking reference",
      "dossier",
    ],
  ],
  ["firstName", ["prenom", "first name", "firstname", "given name"]],
  [
    "lastName",
    [
      "nom",
      "nom de famille",
      "last name",
      "lastname",
      "surname",
      "family name",
    ],
  ],
  [
    "fullName",
    [
      "nom complet",
      "nom et prenom",
      "nom prenom",
      "prenom nom",
      "acheteur",
      "client",
      "spectateur",
      "titulaire",
      "beneficiaire",
      "name",
      "full name",
      "buyer",
      "customer",
      "holder",
    ],
  ],
  [
    "tarif",
    [
      "tarif",
      "categorie",
      "categorie de place",
      "category",
      "type de billet",
      "type billet",
      "type",
      "formule",
      "libelle tarif",
      "price category",
      "ticket type",
    ],
  ],
  [
    "price",
    [
      "prix",
      "prix ttc",
      "montant",
      "montant ttc",
      "prix unitaire",
      "price",
      "amount",
      "total",
    ],
  ],
  [
    "seat",
    [
      "place",
      "numero place",
      "numero de place",
      "siege",
      "fauteuil",
      "seat",
      "seat number",
    ],
  ],
  ["row", ["rang", "rangee", "row"]],
  [
    "quantity",
    [
      "nb places",
      "nombre de places",
      "nb de places",
      "places",
      "quantite",
      "qte",
      "qty",
      "quantity",
      "nombre",
    ],
  ],
  [
    "email",
    [
      "e mail",
      "email",
      "mail",
      "adresse e mail",
      "adresse email",
      "adresse mail",
      "courriel",
      "email address",
    ],
  ],
  [
    "phone",
    [
      "telephone",
      "tel",
      "portable",
      "mobile",
      "numero de telephone",
      "phone",
      "phone number",
      "gsm",
    ],
  ],
  [
    "consent",
    [
      "consentement",
      "optin",
      "opt in",
      "accord marketing",
      "newsletter",
      "accepte les communications",
      "communication organisateur",
      "informations organisateur",
      "marketing",
      "consent",
    ],
  ],
];

/** Une valeur qui ressemble à un code-barres : 6 à 40 caractères, chiffres compris, sans espace. */
const looksLikeCode = (v: string) =>
  /^(?=.*\d)[A-Za-z0-9]+(?:-[A-Za-z0-9]+)?$/.test(v) &&
  v.length >= 6 &&
  v.length <= 40;
const hasLetters = (v: string) => /\p{L}/u.test(v);

/**
 * Ligne de titres : toutes ses cellules non vides contiennent des lettres, aucune
 * ne ressemble à un code-barres, et la ligne suivante a une autre forme (des
 * chiffres là où la première a du texte), ou un titre est reconnu.
 */
function looksLikeHeader(rows: string[][], recognized: number): boolean {
  const first = rows[0] ?? [];
  const cells = first.filter((c) => c.trim() !== "");
  if (
    cells.length === 0 ||
    !cells.every(hasLetters) ||
    cells.some(looksLikeCode)
  )
    return false;
  if (recognized > 0 || rows.length < 2) return true;
  const next = rows[1]!;
  return first.some(
    (c, i) =>
      hasLetters(c) && (next[i] ?? "").trim() !== "" && !hasLetters(next[i]!),
  );
}

/**
 * Proposition de colonnes, toujours confirmée par l'organisateur : depuis la ligne
 * de titres (titres reconnus), ou, sans ligne de titres, la colonne de
 * codes-barres (presque tous valables et différents). Rien n'est jamais deviné
 * d'une ligne de titres inconnue.
 */
export function detectColumns(rows: string[][]): {
  header: boolean;
  map: ColumnMap;
  sure: boolean;
} {
  const first = rows[0] ?? [];
  const map: ColumnMap = {};
  first.forEach((cell, i) => {
    const h = plain(cell);
    if (!h) return;
    for (const [field, names] of SYNONYMS)
      if (map[field] === undefined && names.includes(h))
        return void (map[field] = i);
  });
  if (looksLikeHeader(rows, Object.keys(map).length)) {
    const named = map.fullName !== undefined || map.lastName !== undefined;
    return {
      header: true,
      map,
      sure: map.code !== undefined || (map.reservation !== undefined && named),
    };
  }
  const sample = rows.slice(0, 50);
  const width = Math.max(0, ...sample.map((r) => r.length));
  for (let i = 0; i < width; i++) {
    const values = sample.map((r) => (r[i] ?? "").trim());
    const codes = values.filter(looksLikeCode);
    const share = codes.length / Math.max(1, values.length);
    const unique = new Set(codes).size / Math.max(1, codes.length);
    if (share >= 0.9 && unique >= 0.95)
      return { header: false, map: { code: i }, sure: true };
  }
  return { header: false, map: {}, sure: false };
}
