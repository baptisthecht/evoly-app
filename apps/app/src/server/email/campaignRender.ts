import "server-only";
import { applyMergeTags, inkFor, renderEmailDoc, type EmailDoc } from "@evoly/core";
import { pick } from "@evoly/i18n";
import { formatDateTime, type Locale } from "@evoly/i18n";
import type { EmailBrand } from "./brand";
import { sanitizeEmailHtml } from "./sanitize";
import type { RenderedEmail } from "./templates";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const PALETTE = { creme: "#FFF6F0", charbon: "#222222", blanc: "#FFFFFF", rose: "#FFB8E8" };

export interface CampaignEventCard {
  title: string;
  startsAt: Date;
  timezone: string;
  place: string;
  url: string;
  coverImageUrl: string | null;
}

const COPY = {
  fr: {
    reason: (org: string) => `Vous recevez cet e-mail car vous avez accepté de recevoir les actualités de ${org}.`,
    unsubscribe: "Se désinscrire",
    book: "Voir l’événement",
  },
  en: {
    reason: (org: string) => `You’re receiving this email because you agreed to receive news from ${org}.`,
    unsubscribe: "Unsubscribe",
    book: "See the event",
  },
  es: { reason: (org: string) => `Recibes este e-mail porque aceptaste recibir las novedades de ${org}.`, unsubscribe: "Darse de baja", book: "Ver el evento" },
  de: {
    reason: (org: string) => `Sie erhalten diese E-Mail, weil Sie zugestimmt haben, Neuigkeiten von ${org} zu erhalten.`,
    unsubscribe: "Abmelden",
    book: "Veranstaltung ansehen",
  },
  it: {
    reason: (org: string) => `Ricevi questa e-mail perché hai accettato di ricevere le novità di ${org}.`,
    unsubscribe: "Annulla l’iscrizione",
    book: "Vedi l’evento",
  },
  pt: {
    reason: (org: string) => `Recebe este e-mail porque aceitou receber as novidades de ${org}.`,
    unsubscribe: "Cancelar a subscrição",
    book: "Ver o evento",
  },
  nl: {
    reason: (org: string) => `Je ontvangt deze e-mail omdat je ermee hebt ingestemd nieuws van ${org} te ontvangen.`,
    unsubscribe: "Uitschrijven",
    book: "Bekijk het evenement",
  },
} as const;

/** Section 9.18 : rendu d'une campagne (blocs), avec le pied de page obligatoire (RG-MKT-02). */
export function renderCampaign(o: {
  subject: string;
  previewText?: string | null;
  doc: EmailDoc;
  brand: EmailBrand;
  organizationName: string;
  organizationAddress: string;
  firstName?: string | null;
  locale: Locale;
  unsubscribeUrl: string;
  events: Map<string, CampaignEventCard>;
}): RenderedEmail {
  const c = pick(COPY, o.locale);
  const tag = (s: string) => applyMergeTags(s, { firstName: o.firstName });
  const cards = new Map(
    [...o.events].map(([id, e]) => [
      id,
      { title: e.title, when: formatDateTime(e.startsAt, e.timezone, o.locale, "long"), place: e.place, url: e.url, coverImageUrl: e.coverImageUrl },
    ]),
  );
  // corps de l'e-mail : document riche (ou anciens blocs convertis), blocs HTML nettoyés de nouveau au rendu
  const body = renderEmailDoc(o.doc, {
    firstName: o.firstName,
    accent: o.brand.accent ? { background: o.brand.accent, ink: o.brand.accentInk ?? inkFor(o.brand.accent) } : null,
    events: cards,
    labels: { book: c.book },
    sanitizeHtml: sanitizeEmailHtml,
  });
  const text: string[] = [o.organizationName, "", ...(body.text ? [body.text, ""] : [])];
  const footer = `${esc(o.organizationName)}${o.organizationAddress ? ` · ${esc(o.organizationAddress)}` : ""}<br>${esc(c.reason(o.organizationName))}<br><a href="${esc(o.unsubscribeUrl)}" style="color:#555">${esc(c.unsubscribe)}</a>`;
  const header = o.brand.logoUrl
    ? `<img src="${esc(o.brand.logoUrl)}" alt="${esc(o.organizationName)}" height="40" style="height:40px;width:auto;border:0;display:block">`
    : esc(o.organizationName);
  const preheader = o.previewText ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(tag(o.previewText))}</div>` : "";
  const page = `<!doctype html><html><body style="margin:0;background:${PALETTE.creme};font-family:Poppins,Arial,sans-serif;color:${PALETTE.charbon}">${preheader}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PALETTE.creme};padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${PALETTE.blanc};border-radius:20px;padding:32px">
<tr><td style="font-size:14px;padding-bottom:16px">${header}</td></tr>
${body.html}
<tr><td style="border-top:1px solid #eee;padding-top:16px;font-size:12px;line-height:1.6;color:#555">${footer}</td></tr>
</table></td></tr></table></body></html>`;
  text.push("-", c.reason(o.organizationName), `${c.unsubscribe} : ${o.unsubscribeUrl}`);
  return { subject: tag(o.subject), html: page, text: text.join("\n") };
}
