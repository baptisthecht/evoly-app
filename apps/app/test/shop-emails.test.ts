import { LOCALES } from "@evoly/i18n";
import { describe, expect, it } from "vitest";
import {
  shopOrderConfirmedEmail,
  shopOrderReadyEmail,
  shopOrderShippedEmail,
  shopRefundEmail,
  shopWithdrawalEmail,
} from "@/server/email/shopTemplates";

// Boutique, lots 3b et 3d (section 9.35) : chaque e-mail de la boutique, dans les 7 langues, aux couleurs de
// l'organisation
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

const shipped = {
  carrier: "bpost <express>",
  trackingNumber: "CD123456789BE",
  trackingUrl: "https://track.example/CD123456789BE",
};

describe("e-mails de la boutique (RG-SHOP-08 à RG-SHOP-12, RG-SHOP-15)", () => {
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
        shopOrderShippedEmail({ ...base, locale, ...shipped }),
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
      // expédiée : le bouton mène au suivi du transporteur, le numéro de suivi est rappelé
      expect(mails[5]!.html).toContain(`href="${shipped.trackingUrl}"`);
      expect(mails[5]!.text).toContain(shipped.trackingNumber);
      expect(mails[5]!.html).not.toContain("<express>");
    }
  });

  it("expédiée, en français : sujet, transporteur, suivi", () => {
    const m = shopOrderShippedEmail({ ...base, locale: "fr", ...shipped });
    expect(m.subject).toBe("Votre commande est en route : Théâtre & Cie");
    expect(m.text).toContain(
      "Théâtre & Cie a expédié votre commande avec bpost <express>.",
    );
    expect(m.text).toContain(
      "Suivre mon colis : https://track.example/CD123456789BE",
    );
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
