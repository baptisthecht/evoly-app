/**
 * Adresse normalisée d'un acheteur, pour les limites par acheteur : une même
 * personne ne repart pas de zéro avec une variante de son adresse. Minuscules ;
 * Gmail : points et suffixe « + » ignorés, googlemail.com = gmail.com ;
 * messageries courantes à suffixe « + » : suffixe ignoré ; les autres : rien
 * n'est retiré (un point ou un « + » peut y désigner une autre personne).
 * Même règle dans la migration qui remplit les commandes existantes
 * (packages/db/prisma/migrations/20261027120000_limites_achat).
 */
const GMAIL = new Set(["gmail.com", "googlemail.com"]);
const PLUS = new Set([
  "outlook.com",
  "outlook.fr",
  "outlook.be",
  "hotmail.com",
  "hotmail.fr",
  "hotmail.be",
  "live.com",
  "live.fr",
  "live.be",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "protonmail.com",
  "proton.me",
  "pm.me",
  "fastmail.com",
  "gmx.com",
  "gmx.fr",
  "gmx.de",
]);

export function buyerEmailKey(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at <= 0 || at === e.length - 1 || e.indexOf("@") !== at) return null;
  const local = e.slice(0, at);
  const domain = e.slice(at + 1);
  if (GMAIL.has(domain))
    return `${local.split("+")[0]!.replaceAll(".", "")}@gmail.com`;
  if (PLUS.has(domain)) return `${local.split("+")[0]}@${domain}`;
  return `${local}@${domain}`;
}

/**
 * Prénom et nom normalisés, pour signaler une commande passée sous le nom d'une personne bloquée (alerte seulement,
 * jamais un blocage : les homonymes existent). Casse, accents et espaces ignorés ; l'ordre prénom puis nom est gardé.
 */
export function buyerNameKey(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | null {
  const clean = (s: string | null | undefined) =>
    (s ?? "")
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  const first = clean(firstName);
  const last = clean(lastName);
  if (!first || !last) return null;
  return `${first} ${last}`;
}
