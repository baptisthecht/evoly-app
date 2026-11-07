/**
 * Initiales d'une organisation (refonte A3, maquettes UIUX/) : celles des deux premiers mots porteurs, sans les petits
 * mots (« Les Nuits du Quai » donne NQ) ; à défaut, celles des deux premiers mots, ou les deux premières lettres.
 */
export function orgInitials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const strong = words.filter(
    (w) => w.replace(/[^\p{L}\p{N}]/gu, "").length > 3,
  );
  const pick = strong.length >= 2 ? strong : words;
  const letters =
    pick.length >= 2
      ? pick
          .slice(0, 2)
          .map((w) => [...w.replace(/^[^\p{L}\p{N}]+/u, "")][0] ?? "")
      : [...(pick[0] ?? "")].slice(0, 2);
  return letters.join("").toUpperCase();
}

/** Initiales d'une personne : prénom et nom (« Camille Dupont » donne CD). */
export function personInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => [...w][0]!.toUpperCase())
    .join("");
}
