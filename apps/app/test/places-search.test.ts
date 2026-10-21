import { afterEach, describe, expect, it, vi } from "vitest";
import { searchPlaces } from "@/server/places";

// recherche de lieux (/api/places) : Geoapify avec la clé, Photon sinon ; langue, cache, erreurs sans plantage
const rid = () => Math.random().toString(36).slice(2, 8);
const geojson = (name: string) =>
  new Response(
    JSON.stringify({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [4.35, 50.84] },
          properties: {
            name,
            street: "Rue Duquesnoy",
            housenumber: "14",
            postcode: "1000",
            city: "Bruxelles",
            country_code: "be",
            lat: 50.84,
            lon: 4.35,
            place_id: `p-${rid()}`,
            result_type: "amenity",
          },
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
afterEach(() => {
  delete process.env.GEOAPIFY_API_KEY;
});

describe("recherche de lieux", () => {
  it("moins de 3 caractères : aucune requête", async () => {
    const fetchImpl = vi.fn();
    expect(await searchPlaces("  la ", "fr", fetchImpl as never)).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("Geoapify avec la clé : langue reconnue, sinon l'anglais ; résultats gardés en cache", async () => {
    process.env.GEOAPIFY_API_KEY = "cle-de-test";
    const fetchImpl = vi.fn(async () => geojson("La Madeleine"));
    const q = `Madeleine ${rid()}`;
    const first = await searchPlaces(q, "nl-BE", fetchImpl as never);
    expect(first.length).toBeGreaterThan(0);
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]));
    expect([url.host, url.searchParams.get("lang"), url.searchParams.get("apiKey")]).toEqual(["api.geoapify.com", "nl", "cle-de-test"]);
    await searchPlaces(q, "nl-BE", fetchImpl as never);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // gardé en cache
    await searchPlaces(`Zénith ${rid()}`, "pl", fetchImpl as never);
    expect(new URL(String((fetchImpl.mock.calls[1] as unknown[])[0])).searchParams.get("lang")).toBe("en");
  });

  it("Photon sans clé : langue non prise en charge en « default » ; réponse en erreur ou réseau coupé : liste vide", async () => {
    const failing = vi.fn(async () => new Response("indisponible", { status: 503 }));
    expect(await searchPlaces(`Grand-Place ${rid()}`, "nl", failing as never)).toEqual([]);
    const url = new URL(String((failing.mock.calls[0] as unknown[])[0]));
    expect([url.host, url.searchParams.get("lang")]).toEqual(["photon.komoot.io", "default"]);
    const offline = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await searchPlaces(`Atomium ${rid()}`, "fr", offline as never)).toEqual([]);
  });
});
