import { describe, expect, it } from "vitest";
import { buyerEmailKey } from "../src/buyerKey";

describe("adresse normalisée d'un acheteur (limites par acheteur)", () => {
  it("majuscules et espaces ; Gmail : points, suffixe et googlemail ; Outlook, iCloud : suffixe", () => {
    expect(buyerEmailKey("  Lea.Martin@Exemple.fr ")).toBe(
      "lea.martin@exemple.fr",
    );
    expect(buyerEmailKey("lea.martin+concert@gmail.com")).toBe(
      "leamartin@gmail.com",
    );
    expect(buyerEmailKey("L.E.A.MARTIN@googlemail.com")).toBe(
      "leamartin@gmail.com",
    );
    expect(buyerEmailKey("tom+2@outlook.fr")).toBe("tom@outlook.fr");
    expect(buyerEmailKey("ines+billets@icloud.com")).toBe("ines@icloud.com");
  });
  it("autres messageries : rien n'est retiré ; adresse invalide : aucune clé", () => {
    expect(buyerEmailKey("jean.dupont+asso@exemple.be")).toBe(
      "jean.dupont+asso@exemple.be",
    );
    expect([
      buyerEmailKey(""),
      buyerEmailKey(null),
      buyerEmailKey("pas-une-adresse"),
      buyerEmailKey("a@b@c.fr"),
      buyerEmailKey("@exemple.fr"),
    ]).toEqual([null, null, null, null, null]);
  });
});
