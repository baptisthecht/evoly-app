/** Alphabet sans caractères ambigus (ni 0, O, 1, I, L) pour les codes saisis à la main. */
export const HUMAN_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

/** Code aléatoire sans biais de modulo. */
export function humanCode(length: number, alphabet = HUMAN_ALPHABET): string {
  const max = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < length) {
    for (const b of randomBytes(length * 2)) {
      if (b < max) out += alphabet[b % alphabet.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/** Code court d'un billet, pour la saisie manuelle au scanner (8 caractères). */
export const ticketShortCode = (): string => humanCode(8);

/** Code public d'un événement : evoly.me/e/7KQ2XM (6 caractères). */
export const eventPublicCode = (): string => humanCode(6);

/** Référence de commande lisible : EVO-7KQ2-4X9M. */
export const orderReference = (): string => `EVO-${humanCode(4)}-${humanCode(4)}`;

/** Jeton secret encodé en base64url (128 bits par défaut) : QR codes, liens magiques, liens bénévoles. */
export function secretToken(bytes = 16): string {
  let bin = "";
  for (const b of randomBytes(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Hachage SHA-256 en hexadécimal : seul le hachage des jetons d'accès est stocké. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Lien de revente : evoly.me/r/nuit-7KQ2 (préfixe lisible issu du titre). */
export function resaleLinkCode(eventSlug: string): string {
  const prefix = eventSlug.split("-").filter(Boolean)[0]?.slice(0, 12) ?? "billet";
  return `${prefix}-${humanCode(4)}`;
}
