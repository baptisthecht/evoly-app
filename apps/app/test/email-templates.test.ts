import { describe, expect, it } from "vitest";
import {
  latePaymentRefundEmail,
  orderConfirmationEmail,
  refundEmail,
  reminderEmail,
  resaleSellerEmail,
  resetPasswordEmail,
  salesOpenEmail,
  seatChangedEmail,
  subscriptionEmail,
  ticketsLookupEmail,
  verifyEmailEmail,
  waitlistJoinedEmail,
  waitlistOfferEmail,
  waitlistResaleEmail,
} from "@/server/email/templates";

const LOCALES = ["fr", "en", "nl", "de", "es", "it", "pt"] as const;
// titre piégé : un organisateur ne doit jamais pouvoir injecter du HTML dans un e-mail
const TITLE = 'Gala <b>"Nuit"</b> & bal';
const URL = "https://club.evoly.me/billets/abc123";
const base = {
  brand: null,
  organizationName: "Club de Mouscron",
  eventTitle: TITLE,
};

/** Chaque modèle, dans chaque variante, et les liens attendus dans la version texte. */
function all(locale: (typeof LOCALES)[number]) {
  const l = { ...base, locale };
  return [
    ["vérification", verifyEmailEmail({ url: URL, locale }), [URL]],
    ["mot de passe", resetPasswordEmail({ url: URL, locale }), [URL]],
    [
      "confirmation",
      orderConfirmationEmail({
        ...l,
        when: "samedi 17 avril 2027, 20:00",
        where: "Salle des fêtes, Mouscron",
        online: null,
        lines: [{ name: "Entrée", quantity: 2 }],
        total: "20 €",
        reference: "EVO-123",
        url: URL,
        firstName: "Léa",
        custom: { html: "<p>Bienvenue</p>", text: "Bienvenue" },
      }),
      [URL],
    ],
    [
      "confirmation gratuite en ligne",
      orderConfirmationEmail({
        ...l,
        when: "samedi 17 avril 2027, 20:00",
        where: null,
        online: "https://meet.exemple.be/gala",
        lines: [{ name: "Entrée", quantity: 1 }],
        total: null,
        reference: "EVO-124",
        url: URL,
        firstName: "Léa",
      }),
      [URL],
    ],
    [
      "billets retrouvés",
      ticketsLookupEmail({
        ...l,
        orders: [{ eventTitle: TITLE, when: "samedi 17 avril 2027", url: URL }],
      }),
      [URL],
    ],
    ...(["SOLD", "CANCELLED", "EXPIRED"] as const).map(
      (kind) =>
        [
          `revente ${kind}`,
          resaleSellerEmail({
            ...l,
            kind,
            firstName: "Léa",
            amount: kind === "SOLD" ? "18 €" : null,
          }),
          [],
        ] as const,
    ),
    ...(["PROCESSED", "REJECTED", "CANCELLED"] as const).map(
      (kind) =>
        [
          `remboursement ${kind}`,
          refundEmail({
            ...l,
            kind,
            firstName: "Léa",
            amount: kind === "REJECTED" ? null : "20 €",
            count: 2,
            message: "Merci de votre compréhension",
          }),
          [],
        ] as const,
    ),
    ...(["STARTED", "TRIAL_ENDING", "PAYMENT_FAILED", "ENDED"] as const).map(
      (kind) =>
        [
          `abonnement ${kind}`,
          subscriptionEmail({
            kind,
            locale,
            organizationName: "Club de Mouscron",
            firstName: "Camille",
            url: URL,
          }),
          [URL],
        ] as const,
    ),
    ...(["REMINDER_J7", "REMINDER_J1", "REMINDER_J0"] as const).map(
      (type) =>
        [
          `rappel ${type}`,
          reminderEmail({
            ...l,
            type,
            organizationAddress: "Rue de la Gare 1, 7700 Mouscron",
            firstName: "Léa",
            when: "samedi 17 avril 2027, 20:00",
            where: "Salle des fêtes",
            tickets: 2,
            ticketsUrl: URL,
            unsubscribeEventUrl: `${URL}/stop`,
          }),
          [URL],
        ] as const,
    ),
    [
      "siège modifié",
      seatChangedEmail({
        ...l,
        firstName: "Léa",
        from: "Rang A, siège 4",
        to: "Rang B, siège 7",
        url: URL,
      }),
      [URL],
    ],
    [
      "ouverture des ventes",
      salesOpenEmail({
        ...l,
        when: "samedi 17 avril 2027",
        url: URL,
        unsubscribeUrl: `${URL}/stop`,
      }),
      [URL],
    ],
    ["paiement tardif", latePaymentRefundEmail({ ...l, amount: "20 €" }), []],
    [
      "liste d'attente : inscription",
      waitlistJoinedEmail({
        ...l,
        ticketTypeName: "Entrée",
        unsubscribeUrl: `${URL}/stop`,
      }),
      [`${URL}/stop`],
    ],
    ...[1, 2].map(
      (quantity) =>
        [
          `liste d'attente : offre de ${quantity}`,
          waitlistOfferEmail({
            ...l,
            ticketTypeName: "Entrée",
            quantity,
            until: "21:30",
            url: URL,
            unsubscribeUrl: `${URL}/stop`,
          }),
          [URL],
        ] as const,
    ),
    [
      "liste d'attente : revente",
      waitlistResaleEmail({
        ...l,
        ticketTypeName: "Entrée",
        until: "21:30",
        url: URL,
        unsubscribeUrl: `${URL}/stop`,
      }),
      [URL],
    ],
  ] as const;
}

describe("modèles d'e-mails (section 10)", () => {
  for (const locale of LOCALES) {
    it(`${locale} : chaque modèle et chaque variante se rendent complètement, sans valeur cassée ni HTML injecté`, () => {
      for (const [name, mail, links] of all(locale)) {
        const where = `${name} (${locale})`;
        expect(mail.subject.trim(), where).not.toBe("");
        expect(mail.html, where).toContain("<html");
        expect(mail.text.trim(), where).not.toBe("");
        for (const part of [mail.subject, mail.html, mail.text])
          expect(part, where).not.toMatch(/undefined|NaN|\[object Object\]/);
        expect(mail.html, where).not.toContain('<b>"Nuit"</b>'); // titre échappé dans le HTML
        for (const link of links) expect(mail.text, where).toContain(link);
      }
    });
  }

  it("les variantes d'un même modèle ont des objets différents, et chaque langue a les siens", () => {
    const objets = (["SOLD", "CANCELLED", "EXPIRED"] as const).map(
      (kind) =>
        resaleSellerEmail({
          ...base,
          locale: "fr",
          kind,
          firstName: "Léa",
          amount: "18 €",
        }).subject,
    );
    expect(new Set(objets).size).toBe(3);
    const parLangue = LOCALES.map(
      (locale) =>
        latePaymentRefundEmail({ ...base, locale, amount: "20 €" }).subject,
    );
    expect(new Set(parLangue).size).toBe(LOCALES.length);
  });
});
