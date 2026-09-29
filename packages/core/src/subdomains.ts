/** Sous-domaines réservés (RG-DOM-02). */
export const RESERVED_SUBDOMAINS: ReadonlySet<string> = new Set([
  "app", "api", "www", "scanner", "admin", "mail", "support", "blog", "help", "docs", "status", "evoly",
  "auth", "login", "register", "static", "cdn", "r", "e",
]);

export type SubdomainCheck = { ok: true; value: string } | { ok: false; reason: "LENGTH" | "FORMAT" | "RESERVED" };

/** RG-SDM-01 : [a-z0-9-], 3 à 50 caractères, sans tiret en début ou en fin, hors liste réservée. */
export function checkSubdomain(input: string): SubdomainCheck {
  const value = input.trim().toLowerCase();
  if (value.length < 3 || value.length > 50) return { ok: false, reason: "LENGTH" };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) return { ok: false, reason: "FORMAT" };
  if (RESERVED_SUBDOMAINS.has(value)) return { ok: false, reason: "RESERVED" };
  return { ok: true, value };
}

/** Transforme un nom en identifiant d'URL : « Les Soirées Lumière » → « les-soirees-lumiere ». */
export function slugify(name: string, maxLength = 50): string {
  const s = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " et ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  return s;
}

/** Nettoie un domaine saisi : « https://Tickets.MonSite.com/ » → « tickets.monsite.com ». */
export function normalizeDomain(input: string): string | null {
  const host = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  const label = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
  const parts = host.split(".");
  if (parts.length < 2 || !parts.every((p) => label.test(p)) || host.length > 253) return null;
  if (!/^[a-z]{2,63}$/.test(parts[parts.length - 1]!)) return null;
  return host;
}
