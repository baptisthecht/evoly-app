import { describe, expect, it } from "vitest";
import { refundEmail, resetPasswordEmail, seatChangedEmail, ticketsLookupEmail, verifyEmailEmail } from "@/server/email/templates";

// des mots qui ne doivent jamais apparaître dans un e-mail envoyé dans une autre langue
const FRENCH = /\b(Bonjour|Votre|vos billets|remboursement|Voir mes)\b/i;

describe("e-mails des acheteurs dans leur langue", () => {
  it.each([
    ["es", "Tus entradas", "Reembolso de Gala", "Tu plaza ha cambiado: Gala"],
    ["de", "Ihre Tickets", "Erstattung für Gala", "Ihr Platz hat sich geändert: Gala"],
    ["it", "I tuoi biglietti", "Rimborso per Gala", "Il tuo posto è cambiato: Gala"],
    ["pt", "Os seus bilhetes", "Reembolso de Gala", "O seu lugar mudou: Gala"],
    ["nl", "Je tickets", "Terugbetaling voor Gala", "Je plaats is gewijzigd: Gala"],
  ] as const)("%s : objet et texte traduits, aucun mot français", (locale, lookup, refund, seat) => {
    const l = ticketsLookupEmail({ locale, organizationName: "Asso", orders: [{ eventTitle: "Gala", when: "1/1", url: "https://x.test/t" }] });
    const r = refundEmail({ kind: "PROCESSED", locale, organizationName: "Asso", eventTitle: "Gala", firstName: "Ana", amount: "20 €", count: 1 });
    const s = seatChangedEmail({ locale, organizationName: "Asso", eventTitle: "Gala", firstName: "Ana", from: "A1", to: "B2", url: "https://x.test/t" });
    expect([l.subject, r.subject, s.subject]).toEqual([lookup, refund, seat]);
    for (const m of [l, r, s]) expect(m.text).not.toMatch(FRENCH);
  });

  it("singulier et pluriel distincts dans le remboursement", () => {
    const one = refundEmail({ kind: "PROCESSED", locale: "es", organizationName: "Asso", eventTitle: "Gala", firstName: "Ana", amount: null, count: 1 });
    const many = refundEmail({ kind: "PROCESSED", locale: "es", organizationName: "Asso", eventTitle: "Gala", firstName: "Ana", amount: null, count: 3 });
    expect(one.text).toContain("Tu entrada se ha cancelado. Ya no es válida.");
    expect(many.text).toContain("Tus 3 entradas se han cancelado. Ya no son válidas.");
  });

  it("langue inconnue : repli sur l'anglais, jamais sur le français", () => {
    expect(ticketsLookupEmail({ locale: "ja" as never, organizationName: "Asso", orders: [] }).subject).toBe("Your tickets");
  });

  it("e-mails de compte des organisateurs dans leur langue", () => {
    expect(verifyEmailEmail({ url: "https://x.test/v", locale: "es" }).subject).toBe("Confirma tu dirección de e-mail");
    expect(resetPasswordEmail({ url: "https://x.test/r", locale: "de" }).subject).toBe("Setzen Sie Ihr Passwort zurück");
    expect(verifyEmailEmail({ url: "https://x.test/v", locale: "nl" }).text).not.toMatch(FRENCH);
  });
});

