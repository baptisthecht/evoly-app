import { describe, expect, it } from "vitest";
import { localeFromRequest, withSocialLocale } from "@/lib/socialLocale";

// inscription par Google ou Apple : e-mails dans la langue de l'organisateur
const req = (h: Record<string, string>) => new Headers(h);

describe("langue d'un organisateur inscrit par Google ou Apple", () => {
  it("langue choisie dans l'interface, sinon celle du navigateur, sinon le français", () => {
    expect(
      localeFromRequest(
        req({
          cookie: "a=1; evoly_locale=nl",
          "accept-language": "de-DE,de;q=0.9",
        }),
      ),
    ).toBe("nl");
    expect(
      localeFromRequest(req({ "accept-language": "de-DE,de;q=0.9,en;q=0.8" })),
    ).toBe("de");
    expect(
      localeFromRequest(
        req({ cookie: "evoly_locale=klingon", "accept-language": "ja" }),
      ),
    ).toBe("fr");
    expect(localeFromRequest(null)).toBe("fr");
  });

  it("seulement au retour d'un fournisseur ; une inscription par e-mail garde la langue de son formulaire", () => {
    const headers = req({ cookie: "evoly_locale=es" });
    expect(
      withSocialLocale(
        { email: "a@b.c", locale: "fr" },
        { path: "/callback/google", headers },
      ),
    ).toMatchObject({ locale: "es" });
    expect(
      withSocialLocale(
        { email: "a@b.c", locale: "it" },
        { path: "/sign-up/email", headers },
      ),
    ).toMatchObject({ locale: "it" });
    expect(withSocialLocale({ email: "a@b.c" }, null)).toEqual({
      email: "a@b.c",
    });
  });
});
