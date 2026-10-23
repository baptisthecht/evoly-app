/**
 * Même personne d'un événement à l'autre (classement des ambassadeurs sur toute l'organisation, RG-AMB-05) :
 * son e-mail sans majuscules ni espaces ; à défaut, son nom sans majuscules, accents ni espaces superflus.
 */
export function personKey(
  name: string,
  email: string | null | undefined,
): string {
  const e = (email ?? "").trim().toLowerCase();
  if (e) return `e:${e}`;
  return `n:${name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()}`;
}
