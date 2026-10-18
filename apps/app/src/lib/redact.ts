/** RG-RGPD-03 : aucune donnée personnelle dans les journaux techniques : adresses e-mail et numéros de téléphone masqués. */
export function redact(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[e-mail]")
    .replace(/\b0\d{1,3}\/[\d.\s]{6,}\d/g, "[numéro]") // écriture belge « 0470/12.34.56 » (une date « 01/10/2026 » reste lisible)
    .replace(/\(?\+?\d[\d\s().-]{7,}\d/g, "[numéro]"); // y compris l'indicatif entre parenthèses « (02) 123 45 67 »
}

/** Message d'erreur sûr pour les journaux : jamais l'objet complet (requêtes, destinataires), toujours masqué. */
export function safeError(err: unknown): string {
  return redact(err instanceof Error ? err.message : String(err)).slice(0, 500);
}
