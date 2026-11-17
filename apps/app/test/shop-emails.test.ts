import { LOCALES } from "@evoly/i18n";
import { describe, expect, it } from "vitest";
import {
  shopOrderConfirmedEmail,
  shopOrderReadyEmail,
  shopRefundEmail,
  shopWithdrawalEmail,
} from "@/server/email/shopTemplates";

// Boutique, lot 3b (section 9.35) : chaque e-mail de la boutique, dans les 7 langues, aux couleurs de l'organisation
const receipt = {
  lines: [{ name: "T-shirt (M)", quantity: 2, total: "54,00 €" }],
  subtotal: "54,00 €",
  shipping: null,
  total: "54,00 €",
  vat: [{ rate: "21", amount: "9,37 €" }],
};
const pickup = {
  name: "Accueil <du théâtre>",
  address: "Rue Haute 1\n1000 Bruxelles",
  instructions: null,
};
const base = {
  organizationName: "Théâtre & Cie",
  firstName: "Léa",
  reference: "EVS-7KQ2-4X9M",
  url: "https://theatre.evoly.me/boutique/commande/abc",
};

describe("e-mails de la boutique (RG-SHOP-08 à RG-SHOP-12)", () => {
  it("dans les 7 langues : sujet, texte, lien ; contenu de l'organisation échappé", () => {
    for (const locale of LOCALES) {
      const mails = [
        shopOrderConfirmedEmail({ ...base, locale, receipt, pickup }),
        shopOrderConfirmedEmail({
          ...base,
          locale,
          receipt: { ...receipt, shipping: "4,90 €", total: "58,90 €" },
          pickup: null,
          shipping: { method: "Colis suivi", address: "Rue Basse 2" },
        }),
        shopOrderReadyEmail({ ...base, locale, pickup }),
        shopWithdrawalEmail({ ...base, locale }),
        shopRefundEmail({ ...base, locale, amount: "27,00 €" }),
      ];
      for (const m of mails) {
        expect(m.subject.length).toBeGreaterThan(5);
        expect(m.text).toContain(base.url);
        expect(m.html).toContain(base.url);
        expect(m.html).not.toContain("<du théâtre>");
      }
      expect(mails[0]!.text).toContain("9,37 €");
      expect(mails[1]!.text).toContain("Rue Basse 2");
      expect(mails[4]!.text).toContain("27,00 €");
    }
  });

  it("reçu en français : TVA comprise de chaque taux, droit de rétractation", () => {
    const m = shopOrderConfirmedEmail({
      ...base,
      locale: "fr",
      receipt,
      pickup,
    });
    expect(m.subject).toBe("Votre commande chez Théâtre & Cie");
    expect(m.text).toContain("dont TVA 21 % : 9,37 €");
    expect(m.text).toContain("14 jours");
    expect(m.html).toContain("Théâtre &amp; Cie");
  });
});
