import { describe, expect, it } from "vitest";
import { redact, safeError } from "@/lib/redact";

describe("aucune donnée personnelle dans les journaux (RG-RGPD-03)", () => {
  it("adresses e-mail masquées, quelle que soit la casse", () => {
    expect(redact("envoi à Lea.Martin+test@Exemple.BE refusé")).toBe("envoi à [e-mail] refusé");
    expect(redact("a@b.be, c@d.fr")).toBe("[e-mail], [e-mail]");
  });

  it("numéros de téléphone masqués, dans leurs écritures courantes", () => {
    for (const n of ["+32 470 12 34 56", "0470/12.34.56", "(02) 123 45 67", "+33612345678"]) expect(redact(`tél. ${n}`)).toBe("tél. [numéro]");
  });

  it("montants, petits nombres et dates intacts", () => {
    expect(redact("12,50 € pour 3 billets, commande 2026")).toBe("12,50 € pour 3 billets, commande 2026");
    expect(redact("échéance 01/10/2026, puis 18/10/2026")).toBe("échéance 01/10/2026, puis 18/10/2026");
  });

  it("message d'erreur sûr : jamais l'objet complet, toujours masqué, coupé à 500 caractères", () => {
    expect(safeError(new Error("échec pour lea@exemple.be"))).toBe("échec pour [e-mail]");
    expect(safeError("refus 0470 12 34 56")).toBe("refus [numéro]");
    expect(safeError({ to: "lea@exemple.be" })).toBe("[object Object]");
    expect(safeError(new Error("x".repeat(800)))).toHaveLength(500);
  });
});
