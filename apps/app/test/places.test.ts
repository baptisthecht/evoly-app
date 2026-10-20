import { beforeEach, describe, expect, it, vi } from "vitest";
import sample from "./fixtures-photon.json";
import { clearPlacesCache, placesFromPhoton, searchPlaces } from "@/server/places";

beforeEach(() => clearPlacesCache());
const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));
const feature = (p: Record<string, unknown>, coords = [4.35, 50.85]) => ({ properties: p, geometry: { coordinates: coords } });

describe("recherche d'adresses (Photon, via notre serveur)", () => {
  it("vraie réponse : lieu nommé, adresse à la belge, code postal, ville et pays", () => {
    const [first, , street] = placesFromPhoton(sample);
    expect(first).toMatchObject({
      kind: "venue",
      name: "La Madeleine",
      addressLine1: "Rue Duquesnoy",
      postalCode: "1000",
      city: "Bruxelles",
      country: "BE",
      detail: "Rue Duquesnoy, 1000 Bruxelles",
    });
    expect(street).toMatchObject({ kind: "street", name: "Rue de la Madeleine", addressLine1: "Rue de la Madeleine", city: "Bruxelles" });
  });

  it("adresse avec numéro ; ville seule ; pays étranger affiché ; sans pays ou sans coordonnées : ignoré ; doublons retirés", () => {
    const places = placesFromPhoton({
      features: [
        feature({
          type: "house",
          street: "Rue Royale",
          housenumber: "236",
          postcode: "1210",
          city: "Saint-Josse-ten-Noode",
          countrycode: "be",
          osm_key: "building",
        }),
        feature({ type: "city", name: "Namur", countrycode: "BE", postcode: "5000" }),
        feature({
          type: "house",
          name: "Le Zénith",
          street: "Avenue Jean Jaurès",
          housenumber: "211",
          postcode: "75019",
          city: "Paris",
          country: "France",
          countrycode: "FR",
          osm_key: "amenity",
        }),
        feature({ type: "house", name: "Sans pays", city: "Nulle part" }),
        { properties: { type: "city", name: "Sans coordonnées", countrycode: "BE" } },
        feature({ type: "city", name: "Namur", countrycode: "BE", postcode: "5000" }),
      ],
    });
    expect(places.map((p) => [p.kind, p.name, p.addressLine1, p.city, p.country, p.detail])).toEqual([
      ["address", "Rue Royale 236", "Rue Royale 236", "Saint-Josse-ten-Noode", "BE", "1210 Saint-Josse-ten-Noode"],
      ["city", "Namur", "", "Namur", "BE", "5000 Namur"],
      ["venue", "Le Zénith", "Avenue Jean Jaurès 211", "Paris", "FR", "Avenue Jean Jaurès 211, 75019 Paris, France"],
    ]);
    expect(placesFromPhoton(null)).toEqual([]);
  });

  it("recherche : 3 caractères au moins, l'Europe seulement, la Belgique d'abord, langue de Photon ; résultat gardé en cache", async () => {
    const f = ok(sample);
    expect(await searchPlaces("la", "fr", f as unknown as typeof fetch)).toEqual([]);
    expect(f).not.toHaveBeenCalled();
    await searchPlaces("La  Madeleine ", "nl", f as unknown as typeof fetch);
    await searchPlaces("la madeleine", "nl", f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledTimes(1);
    const url = new URL(String((f.mock.calls[0] as unknown as [string])[0]));
    expect([url.searchParams.get("q"), url.searchParams.get("lang"), url.searchParams.get("bbox"), url.searchParams.get("lat")]).toEqual([
      "La Madeleine",
      "default",
      "-25,34,45,72",
      "50.6",
    ]);
  });

  it("panne ou réponse en erreur : aucune suggestion, et rien de gardé en cache", async () => {
    const down = vi.fn(async () => {
      throw new Error("réseau");
    });
    expect(await searchPlaces("Namur", "fr", down as unknown as typeof fetch)).toEqual([]);
    const err = vi.fn(async () => new Response("", { status: 503 }));
    expect(await searchPlaces("Namur", "fr", err as unknown as typeof fetch)).toEqual([]);
    const f = ok({ features: [feature({ type: "city", name: "Namur", countrycode: "BE" })] });
    expect((await searchPlaces("Namur", "fr", f as unknown as typeof fetch)).map((p) => p.name)).toEqual(["Namur"]);
  });
});
