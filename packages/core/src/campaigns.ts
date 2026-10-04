/** Blocs de l'éditeur de campagnes (section 9.18) : texte, titre, image, bouton, séparateur, événement. */
export type CampaignBlock =
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "image"; url: string; alt?: string }
  | { type: "button"; label: string; url: string }
  | { type: "divider" }
  | { type: "event"; eventId: string };

export type CampaignSegment = { kind: "ALL_CONSENTING"; locale?: "fr" | "en" | null } | { kind: "EVENTS"; eventIds: string[]; ticketTypeIds?: string[]; attendance?: "ANY" | "PRESENT" | "ABSENT"; locale?: "fr" | "en" | null };

const SAFE_URL = /^https?:\/\/[^\s<>"']+$/i;

/** Contenu d'une campagne : blocs connus, textes bornés, liens http(s) uniquement (jamais javascript:). */
export function validateBlocks(input: unknown): CampaignBlock[] | null {
  if (!Array.isArray(input) || input.length === 0 || input.length > 40) return null;
  const out: CampaignBlock[] = [];
  for (const raw of input) {
    const b = raw as Record<string, unknown>;
    const str = (k: string, max: number) => (typeof b[k] === "string" && (b[k] as string).trim().length > 0 && (b[k] as string).length <= max ? (b[k] as string).trim() : null);
    switch (b?.type) {
      case "heading":
      case "text": {
        const text = str("text", b.type === "heading" ? 140 : 4000);
        if (!text) return null;
        out.push({ type: b.type, text });
        break;
      }
      case "image": {
        const url = str("url", 800);
        if (!url || !SAFE_URL.test(url)) return null;
        out.push({ type: "image", url, alt: typeof b.alt === "string" ? b.alt.slice(0, 140) : undefined });
        break;
      }
      case "button": {
        const label = str("label", 60);
        const url = str("url", 800);
        if (!label || !url || !SAFE_URL.test(url)) return null;
        out.push({ type: "button", label, url });
        break;
      }
      case "divider":
        out.push({ type: "divider" });
        break;
      case "event": {
        const eventId = str("eventId", 40);
        if (!eventId) return null;
        out.push({ type: "event", eventId });
        break;
      }
      default:
        return null;
    }
  }
  return out;
}

export function validateSegment(input: unknown): CampaignSegment | null {
  const s = input as Record<string, unknown>;
  const locale = s?.locale === "fr" || s?.locale === "en" ? s.locale : null;
  if (s?.kind === "ALL_CONSENTING") return { kind: "ALL_CONSENTING", locale };
  if (s?.kind === "EVENTS" && Array.isArray(s.eventIds) && s.eventIds.length > 0 && s.eventIds.length <= 50 && s.eventIds.every((e) => typeof e === "string" && e.length <= 40)) {
    const attendance = s.attendance === "PRESENT" || s.attendance === "ABSENT" ? s.attendance : "ANY";
    // filtre par tarif (section 9.18) : facultatif, uniquement des identifiants
    const ticketTypeIds = Array.isArray(s.ticketTypeIds) && s.ticketTypeIds.length > 0 && s.ticketTypeIds.length <= 100 && s.ticketTypeIds.every((t) => typeof t === "string" && t.length <= 40) ? [...new Set(s.ticketTypeIds as string[])] : undefined;
    return { kind: "EVENTS", eventIds: [...new Set(s.eventIds as string[])], ...(ticketTypeIds ? { ticketTypeIds } : {}), attendance, locale };
  }
  return null;
}

/**
 * Personnalisation : la balise du prénom, dans n'importe quelle langue de l'app ({{prenom}}, {{firstName}}, {{nombre}},
 * {{vorname}}, {{nome}}, {{voornaam}}), est remplacée par le prénom, sinon supprimée proprement.
 */
export function applyMergeTags(text: string, vars: { firstName?: string | null }): string {
  const name = (vars.firstName ?? "").trim();
  // balise vide : on retire aussi l'espace qui la précède, sans toucher à la ponctuation (espace avant « ! » en français)
  return text.replace(/( ?)\{\{\s*(?:prenom|prénom|firstName|nombre|vorname|nome|voornaam)\s*\}\}/gi, (_m, space: string) => (name ? `${space}${name}` : ""));
}

/** RG-MKT-05 : programmée, modifiable jusqu'à 30 minutes avant l'envoi et annulable jusqu'à 5 minutes avant. */
export function scheduledEditable(scheduledAt: Date, now: Date): boolean {
  return scheduledAt.getTime() - now.getTime() >= 30 * 60_000;
}
export function scheduledCancellable(scheduledAt: Date, now: Date): boolean {
  return scheduledAt.getTime() - now.getTime() >= 5 * 60_000;
}

/** RG-MKT-07 : envois marketing encore possibles aujourd'hui pour l'organisation. */
export function remainingDailyQuota(cap: number, sentToday: number): number {
  return Math.max(0, cap - sentToday);
}

/** RG-MKT-07 : suspension automatique au-delà de 0,3 % de plaintes (sur un volume significatif). */
export function complaintRateExceeded(complaints: number, delivered: number, minVolume = 1000): boolean {
  return delivered >= minVolume && complaints / delivered > 0.003;
}
