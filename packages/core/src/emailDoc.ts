/**
 * Document d'e-mail riche (éditeur visuel des campagnes, des e-mails automatiques et des blocs des e-mails de billets).
 * Format structuré, sous-ensemble du JSON de TipTap (ProseMirror) : jamais de HTML stocké tel quel, sauf dans un bloc
 * « HTML » nettoyé par le serveur. Validation par liste blanche : chaque nœud, marque, adresse et couleur est vérifié,
 * l'inconnu est écarté sans erreur. Rendu en HTML compatible avec les messageries (tableaux, styles intégrés).
 */
import { applyMergeTags } from "./campaigns";

export type EmailAlign = "left" | "center" | "right";
export type EmailMergeTag = "prenom";
export type EmailMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "underline" }
  | { type: "strike" }
  | { type: "link"; attrs: { href: string } }
  | { type: "textStyle"; attrs: { color: string } };
export type EmailInline = { type: "text"; text: string; marks?: EmailMark[] } | { type: "hardBreak" } | { type: "mergeTag"; attrs: { name: EmailMergeTag } };
export type EmailListItem = { type: "listItem"; content: EmailBlock[] };
export type EmailBlock =
  | { type: "paragraph"; attrs?: { textAlign?: EmailAlign }; content?: EmailInline[] }
  | { type: "heading"; attrs: { level: 1 | 2 | 3; textAlign?: EmailAlign }; content?: EmailInline[] }
  | { type: "bulletList"; content: EmailListItem[] }
  | { type: "orderedList"; content: EmailListItem[] }
  | { type: "blockquote"; content: EmailBlock[] }
  | { type: "horizontalRule" }
  | { type: "image"; attrs: { src: string; alt?: string; width?: number; align?: EmailAlign } }
  | { type: "button"; attrs: { label: string; href: string; align?: EmailAlign; color?: string } }
  | { type: "eventCard"; attrs: { eventId: string } }
  | { type: "spacer"; attrs: { height: number } }
  | { type: "rawHtml"; attrs: { html: string } };
export type EmailDoc = { type: "doc"; content: EmailBlock[] };

/** Nettoyage du HTML brut (bloc « HTML », réservé aux utilisateurs avancés) : fourni par le serveur (sanitize-html). */
export type EmailHtmlSanitizer = (html: string) => string;

export const EMAIL_DOC_LIMITS = { blocks: 300, depth: 4, textPerNode: 5_000, totalText: 60_000, rawHtml: 100_000 } as const;
const ALIGNS = new Set<EmailAlign>(["left", "center", "right"]);
const MERGE_TAGS = new Set<EmailMergeTag>(["prenom"]);

// ---------- validation ----------

/** Adresse sûre : https (http et mailto, tel pour les liens), sans espace ni caractère de contrôle. */
export function safeEmailUrl(value: unknown, kind: "link" | "image" = "link"): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  if (!v || v.length > 2_000 || /[\s\u0000-\u001f\u007f<>"']/.test(v)) return null;
  if (kind === "link" && /^mailto:[^@\s]+@[^@\s]+$/i.test(v)) return v;
  if (kind === "link" && /^tel:\+?[0-9 ().-]{3,30}$/i.test(v)) return v;
  let url: URL;
  try {
    url = new URL(v);
  } catch {
    return null;
  }
  // images : https seulement, sauf servies par localhost (développement et tests de bout en bout)
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname.endsWith(".localhost");
  const allowed = kind === "image" ? (local ? ["https:", "http:"] : ["https:"]) : ["https:", "http:"];
  if (!allowed.includes(url.protocol) || !url.hostname) return null;
  return url.toString();
}

/** Couleur sûre : #RGB ou #RRGGBB. */
export function safeEmailColor(value: unknown): string | null {
  return typeof value === "string" && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim()) ? value.trim().toLowerCase() : null;
}

const align = (v: unknown): EmailAlign | undefined => (typeof v === "string" && ALIGNS.has(v as EmailAlign) ? (v as EmailAlign) : undefined);
const cleanText = (v: unknown) =>
  typeof v === "string" ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, EMAIL_DOC_LIMITS.textPerNode) : "";
const record = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Valide et nettoie un document venu du navigateur. Ne lève jamais : ce qui est invalide est écarté. */
export function validateEmailDoc(input: unknown, opts: { sanitizeHtml?: EmailHtmlSanitizer } = {}): EmailDoc {
  let blocks = 0;
  let text = 0;

  const marks = (raw: unknown): EmailMark[] | undefined => {
    const out: EmailMark[] = [];
    for (const m of list(raw)) {
      const r = record(m);
      if (r.type === "bold" || r.type === "italic" || r.type === "underline" || r.type === "strike") out.push({ type: r.type });
      else if (r.type === "link") {
        const href = safeEmailUrl(record(r.attrs).href);
        if (href) out.push({ type: "link", attrs: { href } });
      } else if (r.type === "textStyle") {
        const color = safeEmailColor(record(r.attrs).color);
        if (color) out.push({ type: "textStyle", attrs: { color } });
      }
    }
    return out.length ? out : undefined;
  };

  const inline = (raw: unknown): EmailInline[] | undefined => {
    const out: EmailInline[] = [];
    for (const n of list(raw)) {
      const r = record(n);
      if (r.type === "text") {
        const t = cleanText(r.text);
        if (!t || text + t.length > EMAIL_DOC_LIMITS.totalText) continue;
        text += t.length;
        const m = marks(r.marks);
        out.push(m ? { type: "text", text: t, marks: m } : { type: "text", text: t });
      } else if (r.type === "hardBreak") out.push({ type: "hardBreak" });
      else if (r.type === "mergeTag" && MERGE_TAGS.has(record(r.attrs).name as EmailMergeTag))
        out.push({ type: "mergeTag", attrs: { name: record(r.attrs).name as EmailMergeTag } });
    }
    return out.length ? out : undefined;
  };

  const items = (raw: unknown, depth: number): EmailListItem[] =>
    list(raw)
      .map((n) => record(n))
      .filter((r) => r.type === "listItem")
      .map((r) => ({ type: "listItem" as const, content: children(r.content, depth + 1) }))
      .filter((i) => i.content.length);

  const block = (raw: unknown, depth: number): EmailBlock | null => {
    if (blocks >= EMAIL_DOC_LIMITS.blocks || depth > EMAIL_DOC_LIMITS.depth) return null;
    const r = record(raw);
    const a = record(r.attrs);
    blocks++;
    switch (r.type) {
      case "paragraph": {
        const content = inline(r.content);
        const textAlign = align(a.textAlign);
        return { type: "paragraph", ...(textAlign ? { attrs: { textAlign } } : {}), ...(content ? { content } : {}) };
      }
      case "heading": {
        const level = a.level === 1 || a.level === 2 || a.level === 3 ? a.level : 2;
        const content = inline(r.content);
        const textAlign = align(a.textAlign);
        return { type: "heading", attrs: { level, ...(textAlign ? { textAlign } : {}) }, ...(content ? { content } : {}) };
      }
      case "bulletList":
      case "orderedList": {
        const content = items(r.content, depth);
        return content.length ? { type: r.type, content } : null;
      }
      case "blockquote": {
        const content = children(r.content, depth + 1);
        return content.length ? { type: "blockquote", content } : null;
      }
      case "horizontalRule":
        return { type: "horizontalRule" };
      case "image": {
        const src = safeEmailUrl(a.src, "image");
        if (!src) return null;
        const width = typeof a.width === "number" && Number.isFinite(a.width) ? Math.min(100, Math.max(20, Math.round(a.width))) : undefined;
        const alt = cleanText(a.alt).slice(0, 200);
        const al = align(a.align);
        return { type: "image", attrs: { src, ...(alt ? { alt } : {}), ...(width ? { width } : {}), ...(al ? { align: al } : {}) } };
      }
      case "button": {
        const href = safeEmailUrl(a.href);
        const label = cleanText(a.label).trim().slice(0, 80);
        if (!href || !label) return null;
        const color = safeEmailColor(a.color);
        const al = align(a.align);
        return { type: "button", attrs: { label, href, ...(al ? { align: al } : {}), ...(color ? { color } : {}) } };
      }
      case "eventCard":
        return typeof a.eventId === "string" && /^[a-z0-9]{8,40}$/i.test(a.eventId) ? { type: "eventCard", attrs: { eventId: a.eventId } } : null;
      case "spacer": {
        const height = typeof a.height === "number" && Number.isFinite(a.height) ? Math.min(96, Math.max(8, Math.round(a.height))) : 24;
        return { type: "spacer", attrs: { height } };
      }
      case "rawHtml": {
        // nettoyé ici (enregistrement) puis de nouveau au rendu : sans nettoyeur, le bloc est écarté
        if (!opts.sanitizeHtml || typeof a.html !== "string") return null;
        const html = opts.sanitizeHtml(a.html.slice(0, EMAIL_DOC_LIMITS.rawHtml));
        return html.trim() ? { type: "rawHtml", attrs: { html } } : null;
      }
      default:
        blocks--;
        return null;
    }
  };

  const children = (raw: unknown, depth: number): EmailBlock[] =>
    list(raw)
      .map((n) => block(n, depth))
      .filter((b): b is EmailBlock => b !== null);

  return { type: "doc", content: children(record(input).content, 0) };
}

/** Rien de visible : ni texte, ni image, ni bouton, ni carte d'événement, ni bloc HTML. */
export function emailDocIsEmpty(doc: EmailDoc): boolean {
  const visible = (b: EmailBlock): boolean => {
    switch (b.type) {
      case "paragraph":
      case "heading":
        return (b.content ?? []).some((i) => i.type === "mergeTag" || (i.type === "text" && i.text.trim() !== ""));
      case "bulletList":
      case "orderedList":
        return b.content.some((li) => li.content.some(visible));
      case "blockquote":
        return b.content.some(visible);
      case "horizontalRule":
      case "spacer":
        return false;
      default:
        return true;
    }
  };
  return !doc.content.some(visible);
}

/** Identifiants des événements présentés dans le document (cartes d'événement), sans doublon. */
export function emailDocEventIds(doc: EmailDoc): string[] {
  const ids = new Set<string>();
  const walk = (blocks: EmailBlock[]) => {
    for (const b of blocks) {
      if (b.type === "eventCard") ids.add(b.attrs.eventId);
      else if (b.type === "blockquote") walk(b.content);
      else if (b.type === "bulletList" || b.type === "orderedList") for (const li of b.content) walk(li.content);
    }
  };
  walk(doc.content);
  return [...ids];
}

// ---------- anciennes campagnes (blocs à texte brut) ----------

/** Convertit les anciens blocs (titre, texte, image, bouton, séparateur, événement) en document riche. */
export function blocksToEmailDoc(blocks: unknown): EmailDoc {
  const paragraphs = (text: string): EmailBlock[] =>
    text.split(/\n{2,}/).map((part) => {
      const lines = part.split("\n");
      const content: EmailInline[] = lines.flatMap((l, i) => [
        ...(i ? [{ type: "hardBreak" as const }] : []),
        ...(l ? [{ type: "text" as const, text: l }] : []),
      ]);
      return { type: "paragraph", ...(content.length ? { content } : {}) };
    });
  const out: unknown[] = [];
  for (const raw of list(blocks)) {
    const b = record(raw);
    if (b.type === "heading" && typeof b.text === "string") out.push({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: b.text }] });
    else if (b.type === "text" && typeof b.text === "string") out.push(...paragraphs(b.text));
    else if (b.type === "image") out.push({ type: "image", attrs: { src: b.url, alt: b.alt } });
    else if (b.type === "button") out.push({ type: "button", attrs: { label: b.label, href: b.url } });
    else if (b.type === "divider") out.push({ type: "horizontalRule" });
    else if (b.type === "event") out.push({ type: "eventCard", attrs: { eventId: b.eventId } });
  }
  return validateEmailDoc({ type: "doc", content: out });
}

/** Contenu enregistré, quel que soit son format : document riche, ou anciens blocs (tableau). */
export function toEmailDoc(content: unknown, opts: { sanitizeHtml?: EmailHtmlSanitizer } = {}): EmailDoc {
  return Array.isArray(content) ? blocksToEmailDoc(content) : validateEmailDoc(content, opts);
}

// ---------- rendu ----------

export interface EmailEventCard {
  title: string;
  when: string;
  place: string;
  url: string;
  coverImageUrl: string | null;
}

export interface EmailRenderOptions {
  /** Prénom du destinataire, toujours échappé. */
  firstName?: string | null;
  /** Couleur de marque des boutons (fond, texte) ; à défaut, le rose d'Evoly. */
  accent?: { background: string; ink: string } | null;
  events?: Map<string, EmailEventCard>;
  labels: { book: string };
  /** Indispensable pour rendre un bloc HTML ; sans lui, le bloc est ignoré. */
  sanitizeHtml?: EmailHtmlSanitizer;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const CHARBON = "#222222";
const ROSE = "#FFB8E8";
const CREME = "#FFF6F0";
const DISPLAY_FONT = "font-family:'Archivo Black','Arial Black',Arial,sans-serif";
const HEADING = {
  1: "font-size:28px;line-height:1.15;letter-spacing:-0.7px",
  2: "font-size:22px;line-height:1.2;letter-spacing:-0.5px",
  3: "font-size:18px;line-height:1.3",
} as const;
const CONTENT_WIDTH = 456;

/** Texte lisible sur une couleur de fond (contraste) : charbon sur fond clair, blanc sur fond foncé. */
export function inkFor(background: string): string {
  const hex = background.replace("#", "");
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.4 ? CHARBON : "#FFFFFF";
}

/** Rend le corps de l'e-mail : lignes de tableau à placer dans la mise en page de l'e-mail, et version texte. */
export function renderEmailDoc(doc: EmailDoc, o: EmailRenderOptions): { html: string; text: string } {
  const accent = o.accent ?? { background: ROSE, ink: CHARBON };
  const merge = (s: string) => applyMergeTags(s, { firstName: o.firstName });

  const inlineHtml = (content: EmailInline[] = []): string =>
    content
      .map((n) => {
        if (n.type === "hardBreak") return "<br>";
        if (n.type === "mergeTag") return esc((o.firstName ?? "").trim());
        let h = esc(merge(n.text));
        let href: string | null = null;
        for (const m of n.marks ?? []) {
          if (m.type === "bold") h = `<strong>${h}</strong>`;
          else if (m.type === "italic") h = `<em>${h}</em>`;
          else if (m.type === "underline") h = `<u>${h}</u>`;
          else if (m.type === "strike") h = `<s>${h}</s>`;
          else if (m.type === "textStyle") h = `<span style="color:${m.attrs.color}">${h}</span>`;
          else if (m.type === "link") href = m.attrs.href;
        }
        return href ? `<a href="${esc(href)}" style="color:${CHARBON};text-decoration:underline">${h}</a>` : h;
      })
      .join("");

  const inlineText = (content: EmailInline[] = []): string =>
    content
      .map((n) => {
        if (n.type === "hardBreak") return "\n";
        if (n.type === "mergeTag") return (o.firstName ?? "").trim();
        const link = n.marks?.find((m) => m.type === "link");
        const t = merge(n.text);
        return link && link.type === "link" && link.attrs.href !== t ? `${t} (${link.attrs.href})` : t;
      })
      .join("");

  const ta = (a?: EmailAlign) => (a && a !== "left" ? `;text-align:${a}` : "");

  /** Rendu d'un bloc sans sa ligne de tableau (utilisé aussi dans les listes et les citations). */
  const inner = (b: EmailBlock): string => {
    switch (b.type) {
      case "paragraph":
        return `<p style="margin:0;font-size:15px;line-height:1.6${ta(b.attrs?.textAlign)}">${inlineHtml(b.content) || "&nbsp;"}</p>`;
      case "heading":
        return `<h${b.attrs.level} style="margin:0;${DISPLAY_FONT};font-weight:400;${HEADING[b.attrs.level]}${ta(b.attrs.textAlign)}">${inlineHtml(b.content)}</h${b.attrs.level}>`;
      case "bulletList":
      case "orderedList": {
        const tag = b.type === "bulletList" ? "ul" : "ol";
        const lis = b.content.map((li) => `<li style="margin:0 0 6px;font-size:15px;line-height:1.6">${li.content.map(inner).join("")}</li>`).join("");
        return `<${tag} style="margin:0;padding:0 0 0 22px">${lis}</${tag}>`;
      }
      case "blockquote":
        return `<div style="border-left:3px solid ${accent.background};padding:2px 0 2px 14px;color:#444444">${b.content.map(inner).join('<div style="height:8px;line-height:8px;font-size:0">&nbsp;</div>')}</div>`;
      case "horizontalRule":
        return `<div style="border-top:1px solid #eeeeee;font-size:0;line-height:0">&nbsp;</div>`;
      case "image": {
        const px = Math.round((CONTENT_WIDTH * (b.attrs.width ?? 100)) / 100);
        return `<img src="${esc(b.attrs.src)}" alt="${esc(b.attrs.alt ?? "")}" width="${px}" style="width:100%;max-width:${px}px;height:auto;border-radius:12px;display:inline-block;border:0">`;
      }
      case "button": {
        const bg = b.attrs.color ?? accent.background;
        const ink = b.attrs.color ? inkFor(b.attrs.color) : accent.ink;
        return `<a href="${esc(b.attrs.href)}" style="display:inline-block;background:${bg};color:${ink};text-decoration:none;font-weight:600;font-size:15px;line-height:1.2;padding:14px 26px;border-radius:999px">${esc(merge(b.attrs.label))}</a>`;
      }
      case "eventCard": {
        const e = o.events?.get(b.attrs.eventId);
        if (!e) return "";
        const cover = e.coverImageUrl
          ? `<tr><td><img src="${esc(e.coverImageUrl)}" alt="" width="${CONTENT_WIDTH}" style="width:100%;height:auto;border-radius:16px 16px 0 0;display:block;border:0"></td></tr>`
          : "";
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREME};border-radius:16px">${cover}<tr><td style="padding:20px"><div style="${DISPLAY_FONT};font-size:18px;line-height:1.25">${esc(e.title)}</div><div style="font-size:14px;line-height:1.5;color:#555555;padding:6px 0 14px">${esc(e.when)}${e.place ? ` · ${esc(e.place)}` : ""}</div><a href="${esc(e.url)}" style="display:inline-block;background:${accent.background};color:${accent.ink};text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px">${esc(o.labels.book)}</a></td></tr></table>`;
      }
      case "spacer":
        return "";
      case "rawHtml":
        return o.sanitizeHtml ? o.sanitizeHtml(b.attrs.html) : "";
    }
  };

  const rows: string[] = [];
  const text: string[] = [];
  const textOf = (b: EmailBlock, prefix = ""): string[] => {
    switch (b.type) {
      case "paragraph":
        return [prefix + inlineText(b.content)];
      case "heading":
        return [prefix + inlineText(b.content).toUpperCase()];
      case "bulletList":
      case "orderedList":
        return b.content.flatMap((li, i) =>
          li.content.flatMap((c, j) => textOf(c, j === 0 ? `${prefix}${b.type === "bulletList" ? "-" : `${i + 1}.`} ` : `${prefix}   `)),
        );
      case "blockquote":
        return b.content.flatMap((c) => textOf(c, `${prefix}> `));
      case "horizontalRule":
        return ["-"];
      case "button":
        return [`${merge(b.attrs.label)} : ${b.attrs.href}`];
      case "eventCard": {
        const e = o.events?.get(b.attrs.eventId);
        return e ? [e.title, `${e.when}${e.place ? ` · ${e.place}` : ""}`, `${o.labels.book} : ${e.url}`] : [];
      }
      case "rawHtml": {
        const html = o.sanitizeHtml ? o.sanitizeHtml(b.attrs.html) : "";
        const plain = html
          .replace(/<br\s*\/?>/gi, "\n")
          .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
          .replace(/<[^>]+>/g, "")
          .replace(/&nbsp;/g, " ")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&");
        return plain.trim() ? [plain.trim()] : [];
      }
      default:
        return [];
    }
  };

  for (const b of doc.content) {
    if (b.type === "spacer") {
      rows.push(`<tr><td style="height:${b.attrs.height}px;line-height:${b.attrs.height}px;font-size:0">&nbsp;</td></tr>`);
      continue;
    }
    const html = inner(b);
    if (!html) continue;
    const al = b.type === "image" || b.type === "button" ? (b.attrs.align ?? (b.type === "button" ? "left" : "center")) : "left";
    const pad = b.type === "heading" ? "padding:8px 0 12px" : "padding:0 0 16px";
    rows.push(`<tr><td align="${al}" style="${pad}">${html}</td></tr>`);
    const t = textOf(b);
    if (t.length) text.push(...t, "");
  }
  return {
    html: rows.join("\n"),
    text: text
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  };
}
