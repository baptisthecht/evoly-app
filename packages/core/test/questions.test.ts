import { describe, expect, it } from "vitest";
import { answerFor, normalizeAccessCode, questionsForOrder, validateQuestion } from "../src";

describe("questions à l'achat (US-QST-01)", () => {
  it("définition : libellé, type, choix pour les listes", () => {
    expect(
      validateQuestion({ label: "Régime alimentaire", type: "SELECT", options: "Aucun\nVégétarien\nVégétarien\n\nSans gluten", scope: "TICKET" }),
    ).toMatchObject({ ok: true, value: { options: ["Aucun", "Végétarien", "Sans gluten"], scope: "TICKET", required: false } });
    expect(validateQuestion({ label: "Taille", type: "SELECT", options: "M" })).toMatchObject({ ok: false, code: "QUESTION_OPTIONS" });
    expect(validateQuestion({ label: "x", type: "TEXT" })).toMatchObject({ ok: false, code: "QUESTION_LABEL" });
    expect(validateQuestion({ label: "Script", type: "HTML" })).toMatchObject({ ok: false, code: "QUESTION_TYPE" });
  });
  it("réponses : obligatoires, formats, choix de la liste", () => {
    const opts = ["Aucun", "Végétarien"];
    expect(answerFor({ type: "TEXT", required: true }, "  ")).toEqual({ ok: false, code: "REQUIRED" });
    expect(answerFor({ type: "TEXT", required: false }, "")).toEqual({ ok: true, value: null });
    expect(answerFor({ type: "SELECT", required: true, options: opts }, "Végétarien")).toEqual({ ok: true, value: "Végétarien" });
    expect(answerFor({ type: "SELECT", required: true, options: opts }, "Carnivore")).toEqual({ ok: false, code: "INVALID" });
    expect(answerFor({ type: "MULTI_SELECT", required: false, options: opts }, ["Aucun", "Aucun"])).toEqual({ ok: true, value: ["Aucun"] });
    expect(answerFor({ type: "CHECKBOX", required: true }, false)).toEqual({ ok: false, code: "REQUIRED" });
    expect(answerFor({ type: "CHECKBOX", required: true }, true)).toEqual({ ok: true, value: true });
    expect(answerFor({ type: "NUMBER", required: true }, "42,5")).toEqual({ ok: true, value: 42.5 });
    expect(answerFor({ type: "NUMBER", required: true }, "douze")).toEqual({ ok: false, code: "INVALID" });
    expect(answerFor({ type: "DATE", required: true }, "2026-02-30")).toEqual({ ok: false, code: "INVALID" });
    expect(answerFor({ type: "DATE", required: true }, "2026-02-28")).toEqual({ ok: true, value: "2026-02-28" });
    expect(answerFor({ type: "EMAIL", required: true }, "Lea@Exemple.BE")).toEqual({ ok: true, value: "lea@exemple.be" });
    expect(answerFor({ type: "PHONE", required: true }, "+32 470 12 34 56")).toEqual({ ok: true, value: "+32 470 12 34 56" });
    expect(answerFor({ type: "PHONE", required: true }, "appelez-moi")).toEqual({ ok: false, code: "INVALID" });
  });
  it("questions applicables selon les tarifs, par commande ou par billet", () => {
    const qs = [
      { id: "q1", label: "Comment nous avez-vous connus ?", type: "TEXT" as const, required: false, scope: "ORDER" as const, ticketTypeIds: [] },
      { id: "q2", label: "Taille du t-shirt", type: "TEXT" as const, required: true, scope: "TICKET" as const, ticketTypeIds: ["vip"] },
      { id: "q3", label: "Numéro de licence", type: "TEXT" as const, required: true, scope: "ORDER" as const, ticketTypeIds: ["club"] },
    ];
    const r = questionsForOrder(qs, [
      { orderItemId: "i1", ticketTypeId: "fosse" },
      { orderItemId: "i2", ticketTypeId: "vip" },
    ]);
    expect(r.order.map((q) => q.id)).toEqual(["q1"]);
    expect(r.perLine).toEqual({ i1: [], i2: [qs[1]] });
  });
  it("code d'accès d'un événement privé (RG-PUB-06)", () => {
    expect(normalizeAccessCode(" gala 2026 ")).toBe("GALA2026");
    expect(normalizeAccessCode("abc")).toBeNull();
    expect(normalizeAccessCode("é-code")).toBeNull();
  });
});
