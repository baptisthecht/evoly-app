import { pick, type Locale } from "@evoly/i18n";
import { palette } from "@evoly/ui";
import type { EmailBrand } from "./brand";
import {
  brandButton,
  brandHeader,
  brandHeading,
  escapeHtml,
  type RenderedEmail,
} from "./templates";

/**
 * E-mails de la boutique (section 9.35) : commande confirmée (reçu avec la TVA de chaque taux), commande prête à
 * retirer, rétractation enregistrée, remboursement ; aux couleurs de l'organisation (Pro).
 */

const COPY = {
  fr: {
    confirmedSubject: (org: string) => `Votre commande chez ${org}`,
    confirmedTitle: "Merci pour votre commande",
    hello: (name: string) => `Bonjour ${name},`,
    confirmedPickup: (org: string) =>
      `${org} prépare votre commande. Un e-mail vous préviendra dès qu’elle sera prête à retirer.`,
    confirmedShipping: (org: string) =>
      `${org} prépare votre commande. Un e-mail vous donnera le lien de suivi à l’expédition.`,
    cta: "Voir ma commande",
    reference: "Référence",
    subtotal: "Produits",
    shipping: "Livraison",
    total: "Total payé",
    vat: (rate: string) => `dont TVA ${rate} %`,
    pickup: "Retrait",
    deliverTo: "Livraison à",
    withdrawal:
      "Droit de rétractation : vous pouvez vous rétracter dans les 14 jours qui suivent la réception de vos produits, depuis la page de votre commande.",
    outro:
      "Gardez cet e-mail : le lien ouvre votre commande, son reçu et son code de retrait.",
    readySubject: (org: string) => `Votre commande est prête : ${org}`,
    readyTitle: "Votre commande est prête",
    readyIntro: (point: string) =>
      `Vous pouvez la retirer à ${point}, en montrant le code QR de votre commande.`,
    readyCta: "Voir mon code de retrait",
    withdrawalSubject: (ref: string) => `Rétractation enregistrée : ${ref}`,
    withdrawalTitle: "Rétractation enregistrée",
    withdrawalIntro: (org: string) =>
      `Votre demande est transmise à ${org}. Rapportez ou renvoyez les produits dans leur état d’origine : vous serez remboursé dès leur retour, et au plus tard 14 jours après.`,
    refundSubject: (ref: string) => `Remboursement de votre commande ${ref}`,
    refundTitle: "Remboursement effectué",
    refundIntro: (org: string, amount: string) =>
      `${org} vous a remboursé ${amount}. Le montant apparaîtra sur votre compte d’ici quelques jours.`,
  },
  en: {
    confirmedSubject: (org: string) => `Your order from ${org}`,
    confirmedTitle: "Thank you for your order",
    hello: (name: string) => `Hello ${name},`,
    confirmedPickup: (org: string) =>
      `${org} is preparing your order. We’ll email you as soon as it’s ready for pickup.`,
    confirmedShipping: (org: string) =>
      `${org} is preparing your order. We’ll email you the tracking link when it ships.`,
    cta: "View my order",
    reference: "Reference",
    subtotal: "Products",
    shipping: "Shipping",
    total: "Total paid",
    vat: (rate: string) => `incl. VAT ${rate}%`,
    pickup: "Pickup",
    deliverTo: "Ship to",
    withdrawal:
      "Right of withdrawal: you can withdraw within 14 days of receiving your products, from your order page.",
    outro:
      "Keep this email: the link opens your order, its receipt and its pickup code.",
    readySubject: (org: string) => `Your order is ready: ${org}`,
    readyTitle: "Your order is ready",
    readyIntro: (point: string) =>
      `You can collect it at ${point} by showing your order’s QR code.`,
    readyCta: "View my pickup code",
    withdrawalSubject: (ref: string) => `Withdrawal recorded: ${ref}`,
    withdrawalTitle: "Withdrawal recorded",
    withdrawalIntro: (org: string) =>
      `Your request has been sent to ${org}. Bring back or return the products in their original condition: you’ll be refunded as soon as they’re back, and within 14 days at the latest.`,
    refundSubject: (ref: string) => `Refund for your order ${ref}`,
    refundTitle: "Refund issued",
    refundIntro: (org: string, amount: string) =>
      `${org} has refunded ${amount}. The amount will appear on your account within a few days.`,
  },
  nl: {
    confirmedSubject: (org: string) => `Je bestelling bij ${org}`,
    confirmedTitle: "Bedankt voor je bestelling",
    hello: (name: string) => `Hallo ${name},`,
    confirmedPickup: (org: string) =>
      `${org} maakt je bestelling klaar. Je krijgt een e-mail zodra ze klaarligt om af te halen.`,
    confirmedShipping: (org: string) =>
      `${org} maakt je bestelling klaar. Bij verzending krijg je de trackinglink per e-mail.`,
    cta: "Mijn bestelling bekijken",
    reference: "Referentie",
    subtotal: "Producten",
    shipping: "Verzending",
    total: "Totaal betaald",
    vat: (rate: string) => `waarvan btw ${rate} %`,
    pickup: "Afhalen",
    deliverTo: "Levering aan",
    withdrawal:
      "Herroepingsrecht: je kunt je bestelling binnen 14 dagen na ontvangst herroepen, via de pagina van je bestelling.",
    outro:
      "Bewaar deze e-mail: de link opent je bestelling, het ontvangstbewijs en de afhaalcode.",
    readySubject: (org: string) => `Je bestelling ligt klaar: ${org}`,
    readyTitle: "Je bestelling ligt klaar",
    readyIntro: (point: string) =>
      `Je kunt ze afhalen bij ${point} door de QR-code van je bestelling te tonen.`,
    readyCta: "Mijn afhaalcode bekijken",
    withdrawalSubject: (ref: string) => `Herroeping geregistreerd: ${ref}`,
    withdrawalTitle: "Herroeping geregistreerd",
    withdrawalIntro: (org: string) =>
      `Je verzoek is doorgegeven aan ${org}. Breng of stuur de producten in hun oorspronkelijke staat terug: je wordt terugbetaald zodra ze terug zijn, uiterlijk binnen 14 dagen.`,
    refundSubject: (ref: string) => `Terugbetaling van je bestelling ${ref}`,
    refundTitle: "Terugbetaling uitgevoerd",
    refundIntro: (org: string, amount: string) =>
      `${org} heeft ${amount} terugbetaald. Het bedrag verschijnt binnen enkele dagen op je rekening.`,
  },
  de: {
    confirmedSubject: (org: string) => `Ihre Bestellung bei ${org}`,
    confirmedTitle: "Vielen Dank für Ihre Bestellung",
    hello: (name: string) => `Hallo ${name},`,
    confirmedPickup: (org: string) =>
      `${org} bereitet Ihre Bestellung vor. Sie erhalten eine E-Mail, sobald sie zur Abholung bereitliegt.`,
    confirmedShipping: (org: string) =>
      `${org} bereitet Ihre Bestellung vor. Beim Versand erhalten Sie den Link zur Sendungsverfolgung per E-Mail.`,
    cta: "Meine Bestellung ansehen",
    reference: "Referenz",
    subtotal: "Produkte",
    shipping: "Versand",
    total: "Bezahlt",
    vat: (rate: string) => `davon MwSt. ${rate} %`,
    pickup: "Abholung",
    deliverTo: "Lieferung an",
    withdrawal:
      "Widerrufsrecht: Sie können innerhalb von 14 Tagen nach Erhalt Ihrer Produkte widerrufen, über die Seite Ihrer Bestellung.",
    outro:
      "Bewahren Sie diese E-Mail auf: Der Link öffnet Ihre Bestellung, den Beleg und den Abholcode.",
    readySubject: (org: string) => `Ihre Bestellung liegt bereit: ${org}`,
    readyTitle: "Ihre Bestellung liegt bereit",
    readyIntro: (point: string) =>
      `Sie können sie bei ${point} abholen, indem Sie den QR-Code Ihrer Bestellung zeigen.`,
    readyCta: "Meinen Abholcode ansehen",
    withdrawalSubject: (ref: string) => `Widerruf erfasst: ${ref}`,
    withdrawalTitle: "Widerruf erfasst",
    withdrawalIntro: (org: string) =>
      `Ihr Antrag wurde an ${org} übermittelt. Bringen oder senden Sie die Produkte im Originalzustand zurück: Sie erhalten die Erstattung, sobald sie zurück sind, spätestens nach 14 Tagen.`,
    refundSubject: (ref: string) => `Erstattung Ihrer Bestellung ${ref}`,
    refundTitle: "Erstattung erfolgt",
    refundIntro: (org: string, amount: string) =>
      `${org} hat Ihnen ${amount} erstattet. Der Betrag erscheint in einigen Tagen auf Ihrem Konto.`,
  },
  es: {
    confirmedSubject: (org: string) => `Tu pedido en ${org}`,
    confirmedTitle: "Gracias por tu pedido",
    hello: (name: string) => `Hola, ${name}:`,
    confirmedPickup: (org: string) =>
      `${org} está preparando tu pedido. Recibirás un correo cuando esté listo para recoger.`,
    confirmedShipping: (org: string) =>
      `${org} está preparando tu pedido. Al enviarlo, recibirás el enlace de seguimiento por correo.`,
    cta: "Ver mi pedido",
    reference: "Referencia",
    subtotal: "Productos",
    shipping: "Envío",
    total: "Total pagado",
    vat: (rate: string) => `IVA ${rate} % incluido`,
    pickup: "Recogida",
    deliverTo: "Envío a",
    withdrawal:
      "Derecho de desistimiento: puedes desistir en los 14 días siguientes a la recepción de tus productos, desde la página de tu pedido.",
    outro:
      "Guarda este correo: el enlace abre tu pedido, su recibo y su código de recogida.",
    readySubject: (org: string) => `Tu pedido está listo: ${org}`,
    readyTitle: "Tu pedido está listo",
    readyIntro: (point: string) =>
      `Puedes recogerlo en ${point} mostrando el código QR de tu pedido.`,
    readyCta: "Ver mi código de recogida",
    withdrawalSubject: (ref: string) => `Desistimiento registrado: ${ref}`,
    withdrawalTitle: "Desistimiento registrado",
    withdrawalIntro: (org: string) =>
      `Tu solicitud se ha enviado a ${org}. Devuelve los productos en su estado original: se te reembolsará en cuanto vuelvan, y como muy tarde en 14 días.`,
    refundSubject: (ref: string) => `Reembolso de tu pedido ${ref}`,
    refundTitle: "Reembolso realizado",
    refundIntro: (org: string, amount: string) =>
      `${org} te ha reembolsado ${amount}. El importe aparecerá en tu cuenta en unos días.`,
  },
  it: {
    confirmedSubject: (org: string) => `Il tuo ordine da ${org}`,
    confirmedTitle: "Grazie per il tuo ordine",
    hello: (name: string) => `Ciao ${name},`,
    confirmedPickup: (org: string) =>
      `${org} sta preparando il tuo ordine. Riceverai un’e-mail appena sarà pronto per il ritiro.`,
    confirmedShipping: (org: string) =>
      `${org} sta preparando il tuo ordine. Alla spedizione riceverai il link di tracciamento via e-mail.`,
    cta: "Vedi il mio ordine",
    reference: "Riferimento",
    subtotal: "Prodotti",
    shipping: "Spedizione",
    total: "Totale pagato",
    vat: (rate: string) => `di cui IVA ${rate} %`,
    pickup: "Ritiro",
    deliverTo: "Consegna a",
    withdrawal:
      "Diritto di recesso: puoi recedere entro 14 giorni dal ricevimento dei prodotti, dalla pagina del tuo ordine.",
    outro:
      "Conserva questa e-mail: il link apre il tuo ordine, la ricevuta e il codice di ritiro.",
    readySubject: (org: string) => `Il tuo ordine è pronto: ${org}`,
    readyTitle: "Il tuo ordine è pronto",
    readyIntro: (point: string) =>
      `Puoi ritirarlo presso ${point} mostrando il codice QR del tuo ordine.`,
    readyCta: "Vedi il mio codice di ritiro",
    withdrawalSubject: (ref: string) => `Recesso registrato: ${ref}`,
    withdrawalTitle: "Recesso registrato",
    withdrawalIntro: (org: string) =>
      `La tua richiesta è stata inviata a ${org}. Riporta o rispedisci i prodotti nel loro stato originale: sarai rimborsato appena rientrati, al più tardi entro 14 giorni.`,
    refundSubject: (ref: string) => `Rimborso del tuo ordine ${ref}`,
    refundTitle: "Rimborso effettuato",
    refundIntro: (org: string, amount: string) =>
      `${org} ti ha rimborsato ${amount}. L’importo apparirà sul tuo conto tra qualche giorno.`,
  },
  pt: {
    confirmedSubject: (org: string) => `A sua encomenda em ${org}`,
    confirmedTitle: "Obrigado pela sua encomenda",
    hello: (name: string) => `Olá ${name},`,
    confirmedPickup: (org: string) =>
      `${org} está a preparar a sua encomenda. Receberá um e-mail assim que estiver pronta para levantar.`,
    confirmedShipping: (org: string) =>
      `${org} está a preparar a sua encomenda. No envio, receberá a ligação de seguimento por e-mail.`,
    cta: "Ver a minha encomenda",
    reference: "Referência",
    subtotal: "Produtos",
    shipping: "Envio",
    total: "Total pago",
    vat: (rate: string) => `IVA ${rate} % incluído`,
    pickup: "Levantamento",
    deliverTo: "Entrega em",
    withdrawal:
      "Direito de livre resolução: pode desistir nos 14 dias seguintes à receção dos seus produtos, na página da sua encomenda.",
    outro:
      "Guarde este e-mail: a ligação abre a sua encomenda, o recibo e o código de levantamento.",
    readySubject: (org: string) => `A sua encomenda está pronta: ${org}`,
    readyTitle: "A sua encomenda está pronta",
    readyIntro: (point: string) =>
      `Pode levantá-la em ${point}, mostrando o código QR da sua encomenda.`,
    readyCta: "Ver o meu código de levantamento",
    withdrawalSubject: (ref: string) => `Livre resolução registada: ${ref}`,
    withdrawalTitle: "Livre resolução registada",
    withdrawalIntro: (org: string) =>
      `O seu pedido foi enviado a ${org}. Devolva os produtos no estado original: será reembolsado assim que forem devolvidos, no máximo em 14 dias.`,
    refundSubject: (ref: string) => `Reembolso da sua encomenda ${ref}`,
    refundTitle: "Reembolso efetuado",
    refundIntro: (org: string, amount: string) =>
      `${org} reembolsou-lhe ${amount}. O montante aparecerá na sua conta dentro de alguns dias.`,
  },
};

type Copy = (typeof COPY)["fr"];

/** Cadre commun des e-mails de la boutique : en-tête de l'organisation, titre, texte, bouton, lignes de détail. */
function frame(o: {
  brand?: EmailBrand | null;
  organizationName: string;
  title: string;
  paragraphs: string[];
  cta: string;
  url: string;
  rows?: Array<[string, string]>;
  notes?: string[];
}): string {
  const u = escapeHtml(o.url);
  const rows = (o.rows ?? [])
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 0;color:#555;font-size:13px;width:130px;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:15px;white-space:pre-line">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html><body style="margin:0;background:${palette.creme};font-family:Poppins,Arial,sans-serif;color:${palette.charbon}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${palette.creme};padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${palette.blanc};border-radius:20px;padding:32px">
<tr><td style="font-size:14px;padding-bottom:8px">${brandHeader(o.organizationName, o.brand)}</td></tr>
<tr><td style="font-family:${brandHeading(o.brand)};font-size:26px;line-height:1.1;letter-spacing:-0.8px;padding-bottom:12px">${escapeHtml(o.title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;padding-bottom:16px">${o.paragraphs.map(escapeHtml).join("<br>")}</td></tr>
<tr><td style="padding-bottom:20px"><a href="${u}" style="display:inline-block;${brandButton(o.brand)};text-decoration:none;font-weight:600;padding:14px 22px">${escapeHtml(o.cta)}</a></td></tr>
${rows ? `<tr><td style="border-top:1px solid #eee;padding-top:12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>` : ""}
${(o.notes ?? []).map((n) => `<tr><td style="font-size:13px;line-height:1.6;color:#555;padding-top:12px">${escapeHtml(n)}</td></tr>`).join("")}
<tr><td style="font-size:13px;line-height:1.6;color:#555;padding-top:16px"><a href="${u}" style="color:${palette.charbon};word-break:break-all">${u}</a></td></tr>
</table></td></tr></table></body></html>`;
}

const text = (lines: Array<string | null | undefined | false>) =>
  lines.filter((l): l is string => !!l).join("\n");

export interface ShopReceipt {
  lines: Array<{ name: string; quantity: number; total: string }>;
  subtotal: string;
  shipping: string | null;
  total: string;
  /** TVA comprise, par taux : « 21 », « 4,30 € » */
  vat: Array<{ rate: string; amount: string }>;
}

/** Reçu en lignes de détail : produits, sous-total, livraison, total, TVA de chaque taux (RG-SHOP-10). */
function receiptRows(c: Copy, r: ShopReceipt): Array<[string, string]> {
  return [
    ...r.lines.map(
      (l) => [`${l.quantity} ×`, `${l.name} · ${l.total}`] as [string, string],
    ),
    ...(r.shipping
      ? ([
          [c.subtotal, r.subtotal],
          [c.shipping, r.shipping],
        ] as Array<[string, string]>)
      : []),
    [c.total, r.total],
    ...r.vat.map(
      (v) => ["", c.vat(v.rate) + ` : ${v.amount}`] as [string, string],
    ),
  ];
}

/** Commande payée : reçu, lieu de retrait ou adresse de livraison, droit de rétractation (RG-SHOP-08, RG-SHOP-11). */
export function shopOrderConfirmedEmail(o: {
  brand?: EmailBrand | null;
  locale: Locale;
  organizationName: string;
  firstName: string;
  reference: string;
  url: string;
  receipt: ShopReceipt;
  pickup: { name: string; address: string; instructions: string | null } | null;
  shipping?: { method: string; address: string } | null;
}): RenderedEmail {
  const c = pick(COPY, o.locale);
  const rows: Array<[string, string]> = [
    [c.reference, o.reference],
    ...receiptRows(c, o.receipt),
    ...(o.pickup
      ? ([
          [
            c.pickup,
            [o.pickup.name, o.pickup.address, o.pickup.instructions]
              .filter(Boolean)
              .join("\n"),
          ],
        ] as Array<[string, string]>)
      : []),
    ...(o.shipping
      ? ([
          [c.deliverTo, `${o.shipping.method}\n${o.shipping.address}`],
        ] as Array<[string, string]>)
      : []),
  ];
  const intro = o.pickup
    ? c.confirmedPickup(o.organizationName)
    : c.confirmedShipping(o.organizationName);
  return {
    subject: c.confirmedSubject(o.organizationName),
    html: frame({
      brand: o.brand,
      organizationName: o.organizationName,
      title: c.confirmedTitle,
      paragraphs: [c.hello(o.firstName), intro],
      cta: c.cta,
      url: o.url,
      rows,
      notes: [c.withdrawal, c.outro],
    }),
    text: text([
      o.organizationName,
      c.confirmedTitle,
      "",
      c.hello(o.firstName),
      intro,
      "",
      `${c.cta} : ${o.url}`,
      "",
      ...rows.map(([l, v]) => (l ? `${l} ${v}` : v)),
      "",
      c.withdrawal,
      c.outro,
    ]),
  };
}

/** Commande prête à retirer (RG-SHOP-09). */
export function shopOrderReadyEmail(o: {
  brand?: EmailBrand | null;
  locale: Locale;
  organizationName: string;
  firstName: string;
  reference: string;
  url: string;
  pickup: { name: string; address: string; instructions: string | null };
}): RenderedEmail {
  const c = pick(COPY, o.locale);
  const where = [o.pickup.name, o.pickup.address, o.pickup.instructions]
    .filter(Boolean)
    .join("\n");
  return {
    subject: c.readySubject(o.organizationName),
    html: frame({
      brand: o.brand,
      organizationName: o.organizationName,
      title: c.readyTitle,
      paragraphs: [c.hello(o.firstName), c.readyIntro(o.pickup.name)],
      cta: c.readyCta,
      url: o.url,
      rows: [
        [c.reference, o.reference],
        [c.pickup, where],
      ],
    }),
    text: text([
      c.readyTitle,
      "",
      c.hello(o.firstName),
      c.readyIntro(o.pickup.name),
      "",
      `${c.readyCta} : ${o.url}`,
      "",
      `${c.reference} : ${o.reference}`,
      `${c.pickup} : ${where}`,
    ]),
  };
}

/** Rétractation enregistrée (RG-SHOP-11) : ce qu'il reste à faire pour être remboursé. */
export function shopWithdrawalEmail(o: {
  brand?: EmailBrand | null;
  locale: Locale;
  organizationName: string;
  firstName: string;
  reference: string;
  url: string;
}): RenderedEmail {
  const c = pick(COPY, o.locale);
  return {
    subject: c.withdrawalSubject(o.reference),
    html: frame({
      brand: o.brand,
      organizationName: o.organizationName,
      title: c.withdrawalTitle,
      paragraphs: [c.hello(o.firstName), c.withdrawalIntro(o.organizationName)],
      cta: c.cta,
      url: o.url,
      rows: [[c.reference, o.reference]],
    }),
    text: text([
      c.withdrawalTitle,
      "",
      c.hello(o.firstName),
      c.withdrawalIntro(o.organizationName),
      "",
      `${c.cta} : ${o.url}`,
    ]),
  };
}

/** Remboursement effectué (RG-SHOP-12). */
export function shopRefundEmail(o: {
  brand?: EmailBrand | null;
  locale: Locale;
  organizationName: string;
  firstName: string;
  reference: string;
  amount: string;
  url: string;
}): RenderedEmail {
  const c = pick(COPY, o.locale);
  return {
    subject: c.refundSubject(o.reference),
    html: frame({
      brand: o.brand,
      organizationName: o.organizationName,
      title: c.refundTitle,
      paragraphs: [
        c.hello(o.firstName),
        c.refundIntro(o.organizationName, o.amount),
      ],
      cta: c.cta,
      url: o.url,
      rows: [[c.reference, o.reference]],
    }),
    text: text([
      c.refundTitle,
      "",
      c.hello(o.firstName),
      c.refundIntro(o.organizationName, o.amount),
      "",
      `${c.cta} : ${o.url}`,
    ]),
  };
}

const SHIPPED = {
  fr: {
    subject: (org: string) => `Votre commande est en route : ${org}`,
    title: "Votre commande est en route",
    intro: (org: string, carrier: string) =>
      `${org} a expédié votre commande avec ${carrier}.`,
    cta: "Suivre mon colis",
    carrier: "Transporteur",
    tracking: "Numéro de suivi",
    order: "Voir ma commande",
  },
  en: {
    subject: (org: string) => `Your order is on its way: ${org}`,
    title: "Your order is on its way",
    intro: (org: string, carrier: string) =>
      `${org} has shipped your order with ${carrier}.`,
    cta: "Track my parcel",
    carrier: "Carrier",
    tracking: "Tracking number",
    order: "View my order",
  },
  nl: {
    subject: (org: string) => `Je bestelling is onderweg: ${org}`,
    title: "Je bestelling is onderweg",
    intro: (org: string, carrier: string) =>
      `${org} heeft je bestelling verstuurd met ${carrier}.`,
    cta: "Mijn pakket volgen",
    carrier: "Vervoerder",
    tracking: "Trackingnummer",
    order: "Mijn bestelling bekijken",
  },
  de: {
    subject: (org: string) => `Ihre Bestellung ist unterwegs: ${org}`,
    title: "Ihre Bestellung ist unterwegs",
    intro: (org: string, carrier: string) =>
      `${org} hat Ihre Bestellung mit ${carrier} verschickt.`,
    cta: "Mein Paket verfolgen",
    carrier: "Versanddienst",
    tracking: "Sendungsnummer",
    order: "Meine Bestellung ansehen",
  },
  es: {
    subject: (org: string) => `Tu pedido está en camino: ${org}`,
    title: "Tu pedido está en camino",
    intro: (org: string, carrier: string) =>
      `${org} ha enviado tu pedido con ${carrier}.`,
    cta: "Seguir mi paquete",
    carrier: "Transportista",
    tracking: "Número de seguimiento",
    order: "Ver mi pedido",
  },
  it: {
    subject: (org: string) => `Il tuo ordine è in viaggio: ${org}`,
    title: "Il tuo ordine è in viaggio",
    intro: (org: string, carrier: string) =>
      `${org} ha spedito il tuo ordine con ${carrier}.`,
    cta: "Segui il mio pacco",
    carrier: "Corriere",
    tracking: "Numero di tracciamento",
    order: "Vedi il mio ordine",
  },
  pt: {
    subject: (org: string) => `A sua encomenda está a caminho: ${org}`,
    title: "A sua encomenda está a caminho",
    intro: (org: string, carrier: string) =>
      `${org} enviou a sua encomenda com ${carrier}.`,
    cta: "Seguir a minha encomenda",
    carrier: "Transportadora",
    tracking: "Número de seguimento",
    order: "Ver a minha encomenda",
  },
};

/** Commande expédiée (RG-SHOP-15) : transporteur, numéro et lien de suivi. */
export function shopOrderShippedEmail(o: {
  brand?: EmailBrand | null;
  locale: Locale;
  organizationName: string;
  firstName: string;
  reference: string;
  url: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string;
}): RenderedEmail {
  const c = pick(COPY, o.locale);
  const s = pick(SHIPPED, o.locale);
  return {
    subject: s.subject(o.organizationName),
    html: frame({
      brand: o.brand,
      organizationName: o.organizationName,
      title: s.title,
      paragraphs: [
        c.hello(o.firstName),
        s.intro(o.organizationName, o.carrier),
      ],
      cta: s.cta,
      url: o.trackingUrl,
      rows: [
        [c.reference, o.reference],
        [s.carrier, o.carrier],
        [s.tracking, o.trackingNumber],
        [s.order, o.url],
      ],
    }),
    text: text([
      s.title,
      "",
      c.hello(o.firstName),
      s.intro(o.organizationName, o.carrier),
      "",
      `${s.cta} : ${o.trackingUrl}`,
      `${s.tracking} : ${o.trackingNumber}`,
      `${s.order} : ${o.url}`,
    ]),
  };
}
