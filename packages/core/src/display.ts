/** Ce que la page publique affiche pour la disponibilité d'un tarif (RG-PUB-02). */
export type AvailabilityDisplay = { kind: "SOLD_OUT" } | { kind: "FEW_LEFT"; remaining: number } | { kind: "AVAILABLE" };

/**
 * « Plus que N » sous un seuil : 10 % de la quantité mise en vente, sans dépasser 20 places.
 * Tarif sans quantité fixée : seuil de 20 places (la jauge de l'événement limite alors le restant).
 */
export function availabilityDisplay(remaining: number, total: number | null): AvailabilityDisplay {
  if (remaining <= 0) return { kind: "SOLD_OUT" };
  if (!Number.isFinite(remaining)) return { kind: "AVAILABLE" };
  const threshold = total == null ? 20 : Math.min(20, Math.max(1, Math.ceil(total * 0.1)));
  return remaining <= threshold ? { kind: "FEW_LEFT", remaining } : { kind: "AVAILABLE" };
}

/** Identifiant d'URL libre : « concert », « concert-2 », « concert-3 »… */
export function uniqueSlug(base: string, taken: ReadonlySet<string>, fallback = "evenement"): string {
  const root = base || fallback;
  if (!taken.has(root)) return root;
  for (let i = 2; ; i++) {
    const candidate = `${root.slice(0, 46)}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** Compte à rebours affiché à moins de 30 jours du début (section 9.10). */
export function daysUntil(startsAt: Date, now: Date): number | null {
  const days = Math.ceil((startsAt.getTime() - now.getTime()) / 86_400_000);
  return days >= 0 && days <= 30 ? days : null;
}
