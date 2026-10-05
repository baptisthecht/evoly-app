import { describe, expect, it } from "vitest";
import { renderEventBlock } from "@/server/email/eventBlock";
import { orderConfirmationEmail, reminderEmail } from "@/server/email/templates";

describe("bloc personnalisé des e-mails de billets et de rappel", () => {
  const content = {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Parking gratuit rue des Lilas" }] },
      { type: "rawHtml", attrs: { html: "<p>Portes à 19 h</p><script>alert(1)</script>" } },
    ],
  };

  it("inséré dans l'e-mail des billets et les rappels, HTML nettoyé, aussi en version texte", () => {
    const custom = renderEventBlock(content, { firstName: "Léa" });
    expect(custom).not.toBeNull();
    const order = orderConfirmationEmail({
      locale: "fr",
      organizationName: "Asso",
      eventTitle: "Gala",
      when: "samedi",
      where: "Mouscron",
      online: null,
      lines: [{ name: "Fosse", quantity: 1 }],
      total: null,
      reference: "EVO-1",
      url: "https://exemple.be",
      firstName: "Léa",
      custom,
    });
    expect(order.html).toContain("Parking gratuit rue des Lilas");
    expect(order.html).toContain("Portes à 19 h");
    expect(order.html).not.toMatch(/<script/i);
    expect(order.text).toContain("Parking gratuit rue des Lilas");
    const reminder = reminderEmail({
      locale: "es",
      type: "REMINDER_J1",
      organizationName: "Asso",
      organizationAddress: "",
      firstName: "Ana",
      eventTitle: "Gala",
      when: "sábado",
      where: "Mouscron",
      tickets: 1,
      ticketsUrl: "https://exemple.be",
      unsubscribeEventUrl: "https://exemple.be/u",
      custom,
    });
    expect(reminder.html).toContain("Parking gratuit rue des Lilas");
  });

  it("vide : rien n'est ajouté", () => {
    expect(renderEventBlock({ type: "doc", content: [{ type: "paragraph" }] }, {})).toBeNull();
    expect(renderEventBlock(null, {})).toBeNull();
  });
});
