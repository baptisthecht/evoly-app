import { describe, expect, it } from "vitest";
import {
  acquisitionFromVisit,
  cookieDomain,
  CONSENT_VERSION,
  googleConsent,
  makeConsent,
  parseAcquisition,
  parseConsent,
  parseEvents,
  serializeAcquisition,
  serializeConsent,
  withoutClickIds,
} from "../src/tracking";

const visit = (url: string, referrer = "", adsAllowed = false) =>
  acquisitionFromVisit({
    url,
    referrer,
    baseDomain: "evoly.me",
    adsAllowed,
    now: new Date("2026-10-20T10:00:00Z"),
  });

describe("consentement (RGPD, ePrivacy)", () => {
  it("un choix valable est relu tel quel ; aucun choix, un choix illisible ou d'une ancienne version : le bandeau revient", () => {
    const c = makeConsent(true, false, new Date("2026-10-20T10:00:00Z"));
    expect(parseConsent(serializeConsent(c))).toEqual(c);
    expect(parseConsent(null)).toBeNull();
    expect(parseConsent("n'importe quoi")).toBeNull();
    expect(
      parseConsent(serializeConsent({ ...c, v: CONSENT_VERSION - 1 })),
    ).toBeNull();
    expect(
      parseConsent(
        encodeURIComponent(
          JSON.stringify({
            v: CONSENT_VERSION,
            analytics: "oui",
            ads: false,
            at: "x",
          }),
        ),
      ),
    ).toBeNull();
  });

  it("signaux de Google : tout refusé sans choix ; publicité refusée : aucune donnée publicitaire", () => {
    expect(googleConsent(null)).toEqual({
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    expect(googleConsent(makeConsent(true, false))).toEqual({
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    expect(googleConsent(makeConsent(true, true)).ad_user_data).toBe("granted");
  });
});

describe("source d'une visite", () => {
  it("paramètres de campagne, en priorité", () => {
    expect(
      visit(
        "https://evoly.me/tarifs?utm_source=newsletter&utm_medium=email&utm_campaign=rentree",
      ),
    ).toMatchObject({
      source: "newsletter",
      medium: "email",
      campaign: "rentree",
      landing: "/tarifs",
      firstAt: "2026-10-20T10:00:00.000Z",
    });
  });

  it("clic Google Ads : source et support déduits ; identifiant gardé seulement avec le consentement à la publicité", () => {
    expect(visit("https://evoly.me/?gclid=Cj0-abc_1")).toMatchObject({
      source: "google",
      medium: "cpc",
    });
    expect(visit("https://evoly.me/?gclid=Cj0-abc_1").gclid).toBeUndefined();
    expect(visit("https://evoly.me/?gclid=Cj0-abc_1", "", true).gclid).toBe(
      "Cj0-abc_1",
    );
  });

  it("site d'origine : moteur de recherche (naturel) ou site tiers (lien) ; nos propres sites ne sont jamais une source", () => {
    expect(visit("https://evoly.me/", "https://www.google.be/")).toMatchObject({
      source: "www.google.be",
      medium: "organic",
    });
    expect(
      visit("https://evoly.me/", "https://www.facebook.com/groupe"),
    ).toMatchObject({
      source: "www.facebook.com",
      medium: "referral",
      referrer: "www.facebook.com",
    });
    expect(
      visit("https://app.evoly.me/register", "https://evoly.me/"),
    ).toMatchObject({ source: "direct", medium: "none", referrer: null });
    expect(
      visit("https://app.evoly.me/register", "https://club.evoly.me/gala"),
    ).toMatchObject({ source: "direct" });
  });

  it("valeurs piégées : caractères dangereux retirés, longueurs bornées", () => {
    const a = visit(
      `https://evoly.me/?utm_source=${encodeURIComponent('<script>"x"</script>')}&utm_campaign=${"a".repeat(500)}`,
    );
    expect(a.source).not.toMatch(/[<>"]/);
    expect(a.campaign!.length).toBe(120);
  });

  it("cookie relu : champs connus seulement ; cookie illisible ou incomplet : aucune source", () => {
    const a = visit(
      "https://evoly.me/?utm_source=x&utm_medium=y&gclid=abc",
      "",
      true,
    );
    expect(parseAcquisition(serializeAcquisition(a))).toEqual(a);
    expect(
      parseAcquisition(
        encodeURIComponent(JSON.stringify({ ...a, admin: true })),
      ) as unknown as Record<string, unknown>,
    ).not.toHaveProperty("admin");
    expect(parseAcquisition("pas du json")).toBeNull();
    expect(
      parseAcquisition(encodeURIComponent(JSON.stringify({ medium: "y" }))),
    ).toBeNull();
  });

  it("publicité refusée ou consentement retiré : identifiants de clic retirés", () => {
    const a = visit("https://evoly.me/?gclid=abc&gbraid=def", "", true);
    expect(withoutClickIds(a)).not.toHaveProperty("gclid");
    expect(withoutClickIds(a)).not.toHaveProperty("gbraid");
    expect(withoutClickIds(a).source).toBe("google");
  });
});

describe("cookies sur tout le domaine, et événements confirmés", () => {
  it("site et application partagent le choix ; en local, aucun domaine", () => {
    expect(cookieDomain("evoly.me", "evoly.me")).toBe(".evoly.me");
    expect(cookieDomain("app.evoly.me", "evoly.me")).toBe(".evoly.me");
    expect(cookieDomain("localhost", "localhost:3001")).toBeUndefined();
    expect(cookieDomain("autre-site.be", "evoly.me")).toBeUndefined();
  });

  it("seuls les événements connus sont relus", () => {
    expect(parseEvents("sign_up,organization_created,purchase,<x>")).toEqual([
      "sign_up",
      "organization_created",
    ]);
    expect(parseEvents(undefined)).toEqual([]);
  });
});
