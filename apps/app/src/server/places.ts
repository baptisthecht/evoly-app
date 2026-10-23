/**
 * Recherche d'adresses et de lieux (données OpenStreetMap), appelée par notre serveur : l'adresse IP des visiteurs ne
 * part pas chez un tiers, les recherches sont limitées et gardées en cache une journée. Geoapify (rapide, clé gratuite
 * GEOAPIFY_API_KEY) s'il est configuré, sinon Photon (serveur public gratuit, parfois lent : plusieurs secondes).
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
const GEOAPIFY = "https://api.geoapify.com/v1/geocode/autocomplete";
const GEOAPIFY_LANGS = new Set(["fr", "en", "nl", "de", "es", "it", "pt"]);
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
    const p = ((f as { properties?: Record<string, unknown> }).properties ??
      {}) as Record<string, unknown>;
    const coords = (f as { geometry?: { coordinates?: unknown } }).geometry
      ?.coordinates;
    const lon = Array.isArray(coords) ? Number(coords[0]) : NaN;
    const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
    const country = str(p.countrycode).toUpperCase();
    if (
      !/^[A-Z]{2}$/.test(country) ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    )
      continue;
    const type = str(p.type);
    const street = str(p.street);
    const number = str(p.housenumber);
    const city =
      str(p.city) ||
      str(p.locality) ||
      str(p.district) ||
      str(p.county) ||
      (type === "city" ? str(p.name) : "");
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
    const addressLine1 =
      kind === "street"
        ? [named || street, number].filter(Boolean).join(" ")
        : [street, number].filter(Boolean).join(" ");
    const name =
      kind === "venue"
        ? named
        : kind === "city"
          ? named || city
          : addressLine1 || named;
    if (!name) continue;
    const detail = [
      kind === "venue" ? addressLine1 : "",
      [postalCode, city].filter(Boolean).join(" "),
      country !== "BE" ? str(p.country) : "",
    ]
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

/** Réponse de Geoapify → les mêmes suggestions que Photon. */
export function placesFromGeoapify(json: unknown): PlaceSuggestion[] {
  const features = (json as { features?: unknown[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: PlaceSuggestion[] = [];
  const seen = new Set<string>();
  for (const f of features) {
    const p = ((f as { properties?: Record<string, unknown> }).properties ??
      {}) as Record<string, unknown>;
    const country = str(p.country_code).toUpperCase();
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    if (
      !/^[A-Z]{2}$/.test(country) ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    )
      continue;
    const type = str(p.result_type);
    const street = str(p.street);
    const number = str(p.housenumber);
    const named = str(p.name);
    const city = str(p.city) || str(p.county);
    const postalCode = str(p.postcode);
    const kind: PlaceSuggestion["kind"] = [
      "city",
      "suburb",
      "district",
      "postcode",
      "county",
      "state",
      "country",
    ].includes(type)
      ? "city"
      : type === "street"
        ? "street"
        : named && named !== street
          ? "venue"
          : "address";
    const addressLine1 =
      kind === "street"
        ? [street || named, number].filter(Boolean).join(" ")
        : [street, number].filter(Boolean).join(" ");
    const name =
      kind === "venue"
        ? named
        : kind === "city"
          ? named || city
          : addressLine1 || named;
    if (!name) continue;
    const detail = [
      kind === "venue" ? addressLine1 : "",
      [postalCode, city].filter(Boolean).join(" "),
      country !== "BE" ? str(p.country) : "",
    ]
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
export async function searchPlaces(
  query: string,
  locale: string,
  fetchImpl: typeof fetch = fetch,
): Promise<PlaceSuggestion[]> {
  const q = query.replace(/\s+/g, " ").trim().slice(0, 120);
  if (q.length < 3) return [];
  const apiKey = process.env.GEOAPIFY_API_KEY ?? "";
  const lang2 = locale.slice(0, 2);
  const lang = apiKey
    ? GEOAPIFY_LANGS.has(lang2)
      ? lang2
      : "en"
    : PHOTON_LANGS.has(lang2)
      ? lang2
      : "default";
  const key = `${apiKey ? "geoapify" : "photon"}|${lang}|${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.places;
  // Geoapify si une clé est fournie (réponse rapide) ; sinon Photon public, souvent 5 à 7 secondes : délai de 9 secondes
  const [url, timeout, read] = apiKey
    ? ([
        `${GEOAPIFY}?${new URLSearchParams({ text: q, lang, limit: "5", filter: `rect:${EUROPE_BBOX}`, bias: "countrycode:be", format: "geojson", apiKey })}`,
        4000,
        placesFromGeoapify,
      ] as const)
    : ([
        `${PHOTON}?${new URLSearchParams({ q, lang, limit: "8", lat: "50.6", lon: "4.6", bbox: EUROPE_BBOX })}`,
        9000,
        placesFromPhoton,
      ] as const);
  try {
    const res = await fetchImpl(url, {
      headers: {
        "user-agent": "Evoly (https://evoly.me; hello@evoly.me)",
        accept: "application/json",
      },
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return [];
    const places = read(await res.json());
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), places });
    return places;
  } catch {
    return [];
  }
}

/** Pour les tests : cache vidé. */
export const clearPlacesCache = () => cache.clear();
