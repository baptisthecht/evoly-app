import "server-only";
import { emailDocIsEmpty, inkFor, renderEmailDoc, toEmailDoc } from "@evoly/core";
import type { EmailBrand } from "./brand";
import { sanitizeEmailHtml } from "./sanitize";

/** Bloc personnalisé d'un événement (e-mails de billets ou de rappel) : lignes HTML et texte, ou null s'il est vide. */
export function renderEventBlock(content: unknown, o: { firstName?: string | null; brand?: EmailBrand | null }): { html: string; text: string } | null {
  if (!content) return null;
  const doc = toEmailDoc(content, { sanitizeHtml: sanitizeEmailHtml });
  if (emailDocIsEmpty(doc)) return null;
  const accent = o.brand?.accent ? { background: o.brand.accent, ink: o.brand.accentInk ?? inkFor(o.brand.accent) } : null;
  const r = renderEmailDoc(doc, { firstName: o.firstName, accent, labels: { book: "" }, sanitizeHtml: sanitizeEmailHtml });
  return r.html ? r : null;
}

/** Lignes du bloc, à placer dans le tableau principal de l'e-mail. */
export const eventBlockRows = (custom?: { html: string } | null) =>
  custom?.html
    ? `<tr><td style="padding-top:20px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${custom.html}</table></td></tr>`
    : "";
