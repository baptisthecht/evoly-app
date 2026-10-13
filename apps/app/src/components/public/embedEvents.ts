/**
 * Événements de la billetterie intégrable (RG-EMB-07) : la page qui accueille le module, ou qui a ouvert la fenêtre d'achat,
 * apprend l'ouverture et la commande terminée, avec le nombre de billets et le montant, sans aucune donnée personnelle.
 */
export type EmbedEvent = { type: "evoly:open" } | { type: "evoly:order_completed"; tickets: number; amountMinor: number; currency: string };

/** Ne garde que les événements connus et leurs champs autorisés : jamais de nom, d'e-mail ni de référence de commande. */
export function sanitizeEmbedEvent(data: unknown): EmbedEvent | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.type === "evoly:open") return { type: "evoly:open" };
  if (d.type === "evoly:order_completed") {
    const tickets = Number(d.tickets);
    const amountMinor = Number(d.amountMinor);
    const currency = typeof d.currency === "string" && /^[A-Z]{3}$/.test(d.currency) ? d.currency : "";
    if (!Number.isInteger(tickets) || tickets < 0 || !Number.isInteger(amountMinor) || amountMinor < 0 || !currency) return null;
    return { type: "evoly:order_completed", tickets, amountMinor, currency };
  }
  return null;
}

/** Dans la fenêtre d'achat : prévient la page qui l'a ouverte que la commande est terminée. */
export function notifyOrderCompleted(tickets: number, amountMinor: number, currency: string) {
  try {
    const opener = window.opener as Window | null;
    const ev = sanitizeEmbedEvent({ type: "evoly:order_completed", tickets, amountMinor, currency });
    if (opener && opener !== window && ev) opener.postMessage(ev, "*");
  } catch {
    // page d'origine fermée ou inaccessible : rien à prévenir
  }
}
