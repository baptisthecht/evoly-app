import { describe, expect, it } from "vitest";
import { personKey } from "../src/people";

describe("même personne d'un événement à l'autre (RG-AMB-05)", () => {
  it("par l'e-mail sans majuscules ni espaces ; à défaut, par le nom sans majuscules, accents ni espaces superflus", () => {
    expect(personKey("Marie", " Marie.Dupont@Exemple.be ")).toBe(
      "e:marie.dupont@exemple.be",
    );
    expect(personKey("Autre nom", "marie.dupont@exemple.be")).toBe(
      personKey("Marie", "MARIE.DUPONT@EXEMPLE.BE"),
    ); // l'e-mail prime sur le nom
    expect(personKey("  Léa   Martin ", null)).toBe("n:lea martin");
    expect(personKey("LEA MARTIN", undefined)).toBe(
      personKey("Léa Martin", ""),
    );
    expect(personKey("Léa Martin", "   ")).toBe("n:lea martin"); // e-mail vide : le nom
    expect(personKey("Léa Martin", null)).not.toBe(
      personKey("Léa Marti", null),
    );
  });
});
