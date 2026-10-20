/**
 * Recherche d'adresses et de lieux (Photon, données OpenStreetMap), appelée par notre serveur : l'adresse IP des
 * visiteurs ne part pas chez un tiers, les recherches sont limitées et gardées en cache une journée.
 */

export interface PlaceSuggestion {
  id: string;
  kind: "venue" | "address" | "street" | "city";
  /** Nom du lieu (salle, théâtre…), ou l'adresse elle-même. */
  name: string;
  /** Rue et numéro, à la belge : « Rue Duquesnoy 14 ». */
  addressLine1: string;
  postalCode: string;
  city: string;
  /** Code ISO du pays (BE, FR…). */
  country: string;
  /** Deuxième ligne affichée : adresse, code postal et ville. */
  detail: string;
  lat: number;
  lon: number;
}

const PHOTON = "https://photon.komoot.io/api/";
const PHOTON_LANGS = new Set(["fr", "en", "de", "it"]);
const EUROPE_BBOX = "-25,34,45,72";
const TTL = 24 * 3600_000;
const MAX_CACHE = 500;
const cache = new Map<string, { at: number; places: PlaceSuggestion[] }>();

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Réponse de Photon → suggestions lisibles, sans doublon, cinq au plus. */
export function placesFromPhoton(json: unknown): PlaceSuggestion[] {
  const features = (json as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: PlaceSuggestion[] = [];
  const seen = new Set<string>();
  for (const f of features) {
    const p = ((f as { properties?: Record<string, unknown> }).properties ?? {}) as Record<string, unknown>;
    const coords = (f as { geometry?: { coordinates?: unknown } }).geometry?.coordinates;
    const lon = Array.isArray(coords) ? Number(coords[0]) : NaN;
    const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
    const country = str(p.countrycode).toUpperCase();
    if (!/^[A-Z]{2}$/.test(country) || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const type = str(p.type);
    const street = str(p.street);
    const number = str(p.housenumber);
    const city = str(p.city) || str(p.locality) || str(p.district) || str(p.county) || (type === "city" ? str(p.name) : "");
    const postalCode = str(p.postcode);
    const named = str(p.name);
    const kind: PlaceSuggestion["kind"] =
      type === "city" || type === "locality" || type === "district"
        ? "city"
        : type === "street"
          ? "street"
          : named && str(p.osm_key) !== "highway" && str(p.osm_key) !== "place"
            ? "venue"
            : "address";
    const addressLine1 = kind === "street" ? [named || street, number].filter(Boolean).join(" ") : [street, number].filter(Boolean).join(" ");
    const name = kind === "venue" ? named : kind === "city" ? named || city : addressLine1 || named;
    if (!name) continue;
    const detail = [kind === "venue" ? addressLine1 : "", [postalCode, city].filter(Boolean).join(" "), country !== "BE" ? str(p.country) : ""]
      .filter(Boolean)
      .join(", ");
    const id = `${name}|${detail}`.toLowerCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      kind,
      name: name.slice(0, 120),
      addressLine1: addressLine1.slice(0, 160),
      postalCode: postalCode.slice(0, 16),
      city: city.slice(0, 80),
      country,
      detail,
      lat,
      lon,
    });
    if (out.length === 5) break;
  }
  return out;
}

/** Recherche : 3 caractères au moins, l'Europe seulement (la Belgique d'abord) ; une panne donne aucune suggestion. */
export async function searchPlaces(query: string, locale: string, fetchImpl: typeof fetch = fetch): Promise<PlaceSuggestion[]> {
  const q = query.replace(/\s+/g, " ").trim().slice(0, 120);
  if (q.length < 3) return [];
  const lang = PHOTON_LANGS.has(locale.slice(0, 2)) ? locale.slice(0, 2) : "default";
  const key = `${lang}|${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.places;
  const url = `${PHOTON}?${new URLSearchParams({ q, lang, limit: "8", lat: "50.6", lon: "4.6", bbox: EUROPE_BBOX })}`;
  try {
    const res = await fetchImpl(url, {
      headers: { "user-agent": "Evoly (https://evoly.me; hello@evoly.me)", accept: "application/json" },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return [];
    const places = placesFromPhoton(await res.json());
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), places });
    return places;
  } catch {
    return [];
  }
}

/** Pour les tests : cache vidé. */
export const clearPlacesCache = () => cache.clear();
