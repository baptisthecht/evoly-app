import { describe, expect, it } from "vitest";
import { applyMergeTags, complaintRateExceeded, remainingDailyQuota, scheduledCancellable, scheduledEditable, validateBlocks, validateSegment } from "../src";

describe("campagnes (US-MKT-03)", () => {
  it("blocs valides ; liens non http(s), blocs inconnus et contenus vides refusés", () => {
    expect(validateBlocks([{ type: "heading", text: " Printemps " }, { type: "button", label: "Réserver", url: "https://club.evoly.me/printemps" }, { type: "divider" }])).toEqual([{ type: "heading", text: "Printemps" }, { type: "button", label: "Réserver", url: "https://club.evoly.me/printemps" }, { type: "divider" }]);
    expect(validateBlocks([{ type: "button", label: "Clic", url: "javascript:alert(1)" }])).toBeNull();
    expect(validateBlocks([{ type: "image", url: "data:image/png;base64,AAAA" }])).toBeNull();
    expect(validateBlocks([{ type: "script", text: "x" }])).toBeNull();
    expect(validateBlocks([{ type: "text", text: "   " }])).toBeNull();
    expect(validateBlocks([])).toBeNull();
  });
  it("destinataires : tous les consentants, ou participants d'événements, présents ou absents", () => {
    expect(validateSegment({ kind: "ALL_CONSENTING", locale: "nl" })).toEqual({ kind: "ALL_CONSENTING", locale: null });
    expect(validateSegment({ kind: "EVENTS", eventIds: ["a", "a", "b"], attendance: "ABSENT" })).toEqual({ kind: "EVENTS", eventIds: ["a", "b"], attendance: "ABSENT", locale: null });
    expect(validateSegment({ kind: "EVENTS", eventIds: [] })).toBeNull();
    expect(validateSegment({ kind: "EVENTS", eventIds: ["a"], ticketTypeIds: ["t1", "t1"] })).toEqual({ kind: "EVENTS", eventIds: ["a"], ticketTypeIds: ["t1"], attendance: "ANY", locale: null });
  });
  it("personnalisation par le prénom", () => {
    expect(applyMergeTags("Bonjour {{prenom}}, à bientôt !", { firstName: "Léa" })).toBe("Bonjour Léa, à bientôt !");
    expect(applyMergeTags("Bonjour {{ firstName }}, à bientôt !", {})).toBe("Bonjour, à bientôt !");
  });
  it("programmation : modifiable 30 minutes avant, annulable 5 minutes avant (RG-MKT-05)", () => {
    const at = new Date("2026-10-10T18:00:00Z");
    expect(scheduledEditable(at, new Date("2026-10-10T17:29:00Z"))).toBe(true);
    expect(scheduledEditable(at, new Date("2026-10-10T17:31:00Z"))).toBe(false);
    expect(scheduledCancellable(at, new Date("2026-10-10T17:54:00Z"))).toBe(true);
    expect(scheduledCancellable(at, new Date("2026-10-10T17:56:00Z"))).toBe(false);
  });
  it("plafond quotidien et taux de plaintes (RG-MKT-07)", () => {
    expect(remainingDailyQuota(5000, 4990)).toBe(10);
    expect(remainingDailyQuota(5000, 6000)).toBe(0);
    expect(complaintRateExceeded(4, 1000)).toBe(true);
    expect(complaintRateExceeded(3, 1000)).toBe(false);
    expect(complaintRateExceeded(5, 200)).toBe(false); // volume trop faible pour conclure
  });
});

describe("balise du prénom dans chaque langue de l'app", () => {
  it.each(["{{prenom}}", "{{firstName}}", "{{nombre}}", "{{Vorname}}", "{{nome}}", "{{voornaam}}"])("%s", (tag) => {
    expect(applyMergeTags(`Hola ${tag},`, { firstName: "Ana" })).toBe("Hola Ana,");
    expect(applyMergeTags(`Hola ${tag},`, { firstName: null })).toBe("Hola,");
  });
  it("une autre balise reste telle quelle", () => {
    expect(applyMergeTags("{{ciudad}}", { firstName: "Ana" })).toBe("{{ciudad}}");
  });
});

