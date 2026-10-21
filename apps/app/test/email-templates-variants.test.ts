import { describe, expect, it } from "vitest";
import { refundEmail, reminderEmail, resaleSellerEmail } from "@/server/email/templates";

// modèles d'e-mails : variantes conditionnelles (motif, bloc personnalisé, logo de la marque, caractères spéciaux neutralisés)
const base = { locale: "fr" as const, organizationName: "Club de Mouscron", eventTitle: "Gala de printemps", firstName: "Léa" };
const reminder = (custom?: { html: string; text: string } | null) =>
  reminderEmail({
    ...base,
    type: "REMINDER_J1",
    organizationAddress: "Rue de la Station 12, 7700 Mouscron",
    when: "samedi 17 avril 2027 à 20:00",
    where: "Salle des fêtes, Mouscron",
    tickets: 2,
    ticketsUrl: "https://app.evoly.me/billets/jeton",
    unsubscribeEventUrl: "https://app.evoly.me/desinscription/jeton",
    custom,
  });

describe("e-mail de remboursement", () => {
  it("motif de l'organisateur présent s'il existe, absent sinon", () => {
    const withReason = refundEmail({ ...base, kind: "REJECTED", amount: null, count: 1, message: "Demande arrivée après la date limite" });
    expect(withReason.html).toContain("Demande arrivée après la date limite");
    const without = refundEmail({ ...base, kind: "REJECTED", amount: null, count: 1, message: null });
    expect(without.html).not.toContain("Demande arrivée après la date limite");
    expect(without.html.length).toBeLessThan(withReason.html.length);
  });

  it("titre et motif : caractères spéciaux neutralisés", () => {
    const m = refundEmail({ ...base, eventTitle: "Gala <script>", kind: "PROCESSED", amount: "20 €", count: 2, message: "<b>Merci</b> & à bientôt" });
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<b>Merci</b>");
    expect(m.html).toContain("&lt;b&gt;Merci&lt;/b&gt; &amp; à bientôt");
  });
});

describe("e-mail de rappel", () => {
  it("bloc personnalisé de l'organisateur inclus en HTML et en texte ; absent sans bloc", () => {
    const custom = { html: "<p>Vestiaire gratuit à l’entrée</p>", text: "Vestiaire gratuit à l’entrée" };
    const m = reminder(custom);
    expect(m.html).toContain(custom.html);
    expect(m.text).toContain(custom.text);
    const plain = reminder(null);
    expect(plain.html).not.toContain("Vestiaire gratuit");
    expect(plain.text).not.toContain("Vestiaire gratuit");
    expect(plain.html).toContain("https://app.evoly.me/billets/jeton");
  });
});

describe("e-mail au vendeur d'une revente", () => {
  it("logo de la marque dans l'en-tête quand l'organisateur en a un", () => {
    const logo = "https://cdn.evoly.me/orgs/o1/logo.png";
    const branded = resaleSellerEmail({ ...base, kind: "SOLD", amount: "18 €", brand: { logoUrl: logo } as never });
    expect(branded.html).toContain(logo);
    const plain = resaleSellerEmail({ ...base, kind: "SOLD", amount: "18 €", brand: null });
    expect(plain.html).not.toContain(logo);
    expect(plain.html).toContain("Club de Mouscron");
  });
});
