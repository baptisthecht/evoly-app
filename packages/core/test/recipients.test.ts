import { describe, expect, it } from "vitest";
import { parseRecipients } from "../src";

describe("billets offerts : liste des destinataires (US-ORD-03)", () => {
  it("formats acceptés, doublons retirés, lignes invalides signalées", () => {
    const r = parseRecipients(["lea@exemple.be", "Tom Dubois <Tom@Exemple.be>", "ines@exemple.be;Inès;Benali", "  ", "sam@exemple.be,Sam,", "LEA@exemple.be", "pas une adresse", "Camille <camille@@exemple.be>"].join("\n"));
    expect(r.recipients).toEqual([
      { email: "lea@exemple.be", firstName: null, lastName: null },
      { email: "tom@exemple.be", firstName: "Tom", lastName: "Dubois" },
      { email: "ines@exemple.be", firstName: "Inès", lastName: "Benali" },
      { email: "sam@exemple.be", firstName: "Sam", lastName: null },
    ]);
    expect(r.errors).toEqual([{ line: 7, value: "pas une adresse" }, { line: 8, value: "Camille <camille@@exemple.be>" }]);
    expect(r.tooMany).toBe(false);
  });
  it("au plus 200 destinataires par envoi", () => {
    const r = parseRecipients(Array.from({ length: 205 }, (_, i) => `p${i}@exemple.be`).join("\n"));
    expect(r.recipients).toHaveLength(200);
    expect(r.tooMany).toBe(true);
  });
});
