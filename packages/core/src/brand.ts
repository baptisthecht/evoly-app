/** Type réel d'une image, lu dans ses premiers octets (jamais d'après l'extension ni le type déclaré). SVG refusé : risque de script. */
export function sniffImage(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

const hex = (n: number) => n.toString(16).padStart(2, "0");

/**
 * Couleurs dominantes d'un logo (section 9.19) : pixels opaques regroupés par teinte approchée,
 * en écartant les quasi-blancs, quasi-noirs et gris, pour proposer une couleur principale et une couleur d'accent.
 */
export function dominantColors(rgba: ArrayLike<number>, count = 2): string[] {
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const [r, g, b, a] = [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!, rgba[i + 3]!];
    if (a < 200) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max < 40 || min > 225 || max - min < 28) continue; // noir, blanc ou gris
    const key = `${r >> 5}-${g >> 5}-${b >> 5}`;
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  const ranked = [...buckets.values()].sort((a, b) => b.n - a.n).map((c) => ({ r: Math.round(c.r / c.n), g: Math.round(c.g / c.n), b: Math.round(c.b / c.n) }));
  const picked: Array<{ r: number; g: number; b: number }> = [];
  for (const c of ranked) {
    // deux propositions nettement différentes l'une de l'autre
    if (picked.every((p) => Math.abs(p.r - c.r) + Math.abs(p.g - c.g) + Math.abs(p.b - c.b) > 90)) picked.push(c);
    if (picked.length === count) break;
  }
  return picked.map((c) => `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`.toUpperCase());
}

/** Couleur saisie : #RRGGBB en majuscules, ou null. */
export function normalizeHexColor(input: string | null | undefined): string | null {
  if (!input) return null;
  const s = input.trim().replace(/^#?/, "#");
  if (/^#[0-9a-fA-F]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toUpperCase();
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : null;
}

/** RG-FILE-01 : fichier SVG (début du fichier, avec ou sans déclaration XML). */
export function isSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.slice(0, 1024)).replace(/^\uFEFF/, "").trimStart().toLowerCase();
  return head.startsWith("<svg") || ((head.startsWith("<?xml") || head.startsWith("<!doctype svg") || head.startsWith("<!--")) && head.includes("<svg"));
}

/**
 * SVG sans danger avant conversion : ni script, ni objet étranger, ni gestionnaire d'événement, ni référence externe
 * (seuls les liens internes « # » et les images intégrées « data:image/ » sont admis), ni entité XML, ni import de style.
 */
export function svgIsSafe(text: string): boolean {
  const t = text.toLowerCase();
  if (/<script|<foreignobject|<!entity|@import|javascript:/.test(t)) return false;
  if (/\son[a-z]+\s*=/.test(t)) return false;
  if (/(?:xlink:)?href\s*=\s*["']?\s*(?!#|data:image\/)[^"'\s>]/.test(t)) return false;
  if (/url\(\s*["']?\s*(?!#|data:image\/)[^)"'\s]/.test(t)) return false;
  return true;
}

/**
 * RG-CDM-02 : certificat d'un domaine personnalisé à signaler. Caddy renouvelle 30 jours avant l'échéance :
 * moins de 14 jours restants signifie que le renouvellement échoue ; un certificat refusé est signalé tout de suite.
 */
export function certificateProblem(o: { authorized: boolean; validTo: Date | null }, now: Date): "INVALID" | "EXPIRING" | null {
  if (!o.authorized || !o.validTo || o.validTo.getTime() <= now.getTime()) return "INVALID";
  return o.validTo.getTime() - now.getTime() < 14 * 86_400_000 ? "EXPIRING" : null;
}
