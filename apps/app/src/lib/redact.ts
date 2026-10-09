/** RG-RGPD-03 : aucune donnée personnelle dans les journaux techniques : adresses e-mail et numéros de téléphone masqués. */
export function redact(text: string): string {
  return text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[e-mail]").replace(/\+?\d[\d\s().-]{7,}\d/g, "[numéro]");
}

/** Message d'erreur sûr pour les journaux : jamais l'objet complet (requêtes, destinataires), toujours masqué. */
export function safeError(err: unknown): string {
  return redact(err instanceof Error ? err.message : String(err)).slice(0, 500);
}
