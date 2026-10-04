import { pick, type Locale } from "@evoly/i18n";
import type { EmailBrand } from "./brand";
import { palette } from "@evoly/ui";


export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Mise en page commune des e-mails système (thème Evoly). */
function layout({ title, intro, cta, url, outro }: { title: string; intro: string; cta: string; url: string; outro: string }): string {
  const u = escapeHtml(url);
  return `<!doctype html><html><body style="margin:0;background:${palette.creme};font-family:Poppins,Arial,sans-serif;color:${palette.charbon}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${palette.creme};padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${palette.blanc};border-radius:20px;padding:32px">
<tr><td style="font-family:'Archivo Black',Arial Black,Arial,sans-serif;font-size:22px;letter-spacing:-0.5px;padding-bottom:16px">evoly</td></tr>
<tr><td style="font-family:'Archivo Black',Arial Black,Arial,sans-serif;font-size:26px;line-height:1.1;letter-spacing:-0.8px;padding-bottom:12px">${escapeHtml(title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;padding-bottom:24px">${escapeHtml(intro)}</td></tr>
<tr><td style="padding-bottom:24px"><a href="${u}" style="display:inline-block;background:${palette.rose};color:${palette.charbon};text-decoration:none;font-weight:600;padding:14px 22px;border-radius:999px">${escapeHtml(cta)}</a></td></tr>
<tr><td style="font-size:13px;line-height:1.6;color:#555">${escapeHtml(outro)}<br><a href="${u}" style="color:${palette.charbon};word-break:break-all">${u}</a></td></tr>
</table></td></tr></table></body></html>`;
}

const COPY = {
  verify: {
    fr: { subject: "Confirmez votre adresse e-mail", title: "Bienvenue sur Evoly", intro: "Confirmez votre adresse pour accéder à votre espace et créer votre premier événement.", cta: "Confirmer mon adresse", outro: "Ce lien est valable 24 heures. Si vous n'avez pas créé de compte, ignorez cet e-mail." },
    en: { subject: "Confirm your email address", title: "Welcome to Evoly", intro: "Confirm your address to access your space and create your first event.", cta: "Confirm my address", outro: "This link is valid for 24 hours. If you didn't create an account, you can ignore this email." },
    es: { subject: "Confirma tu dirección de e-mail", title: "Te damos la bienvenida a Evoly", intro: "Confirma tu dirección para acceder a tu espacio y crear tu primer evento.", cta: "Confirmar mi dirección", outro: "Este enlace es válido durante 24 horas. Si no has creado una cuenta, puedes ignorar este e-mail." },
    de: { subject: "Bestätigen Sie Ihre E-Mail-Adresse", title: "Willkommen bei Evoly", intro: "Bestätigen Sie Ihre Adresse, um auf Ihren Bereich zuzugreifen und Ihre erste Veranstaltung zu erstellen.", cta: "Meine Adresse bestätigen", outro: "Dieser Link ist 24 Stunden gültig. Wenn Sie kein Konto erstellt haben, können Sie diese E-Mail ignorieren." },
    it: { subject: "Conferma il tuo indirizzo e-mail", title: "Benvenuto su Evoly", intro: "Conferma il tuo indirizzo per accedere al tuo spazio e creare il tuo primo evento.", cta: "Conferma il mio indirizzo", outro: "Questo link è valido per 24 ore. Se non hai creato un account, puoi ignorare questa e-mail." },
    pt: { subject: "Confirme o seu endereço de e-mail", title: "Bem-vindo à Evoly", intro: "Confirme o seu endereço para aceder ao seu espaço e criar o seu primeiro evento.", cta: "Confirmar o meu endereço", outro: "Este link é válido durante 24 horas. Se não criou uma conta, pode ignorar este e-mail." },
    nl: { subject: "Bevestig je e-mailadres", title: "Welkom bij Evoly", intro: "Bevestig je adres om naar je ruimte te gaan en je eerste evenement te maken.", cta: "Mijn adres bevestigen", outro: "Deze link is 24 uur geldig. Heb je geen account aangemaakt? Dan kun je deze e-mail negeren." },
  },
  reset: {
    fr: { subject: "Réinitialisez votre mot de passe", title: "Nouveau mot de passe", intro: "Vous avez demandé à réinitialiser votre mot de passe. Choisissez-en un nouveau avec le bouton ci-dessous.", cta: "Choisir un mot de passe", outro: "Ce lien est valable une heure et ne fonctionne qu'une fois. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail." },
    en: { subject: "Reset your password", title: "New password", intro: "You asked to reset your password. Choose a new one with the button below.", cta: "Choose a password", outro: "This link is valid for one hour and works only once. If you didn't ask for this, you can ignore this email." },
    es: { subject: "Restablece tu contraseña", title: "Nueva contraseña", intro: "Has pedido restablecer tu contraseña. Elige una nueva con el botón de abajo.", cta: "Elegir una contraseña", outro: "Este enlace es válido durante una hora y solo funciona una vez. Si no lo has pedido tú, puedes ignorar este e-mail." },
    de: { subject: "Setzen Sie Ihr Passwort zurück", title: "Neues Passwort", intro: "Sie haben das Zurücksetzen Ihres Passworts angefordert. Wählen Sie mit der Schaltfläche unten ein neues.", cta: "Passwort wählen", outro: "Dieser Link ist eine Stunde gültig und funktioniert nur einmal. Wenn Sie das nicht angefordert haben, können Sie diese E-Mail ignorieren." },
    it: { subject: "Reimposta la tua password", title: "Nuova password", intro: "Hai chiesto di reimpostare la tua password. Scegline una nuova con il pulsante qui sotto.", cta: "Scegli una password", outro: "Questo link è valido per un’ora e funziona una sola volta. Se non l’hai richiesto tu, puoi ignorare questa e-mail." },
    pt: { subject: "Redefina a sua palavra-passe", title: "Nova palavra-passe", intro: "Pediu para redefinir a sua palavra-passe. Escolha uma nova com o botão abaixo.", cta: "Escolher uma palavra-passe", outro: "Este link é válido durante uma hora e só funciona uma vez. Se não foi você que pediu, pode ignorar este e-mail." },
    nl: { subject: "Stel je wachtwoord opnieuw in", title: "Nieuw wachtwoord", intro: "Je hebt gevraagd om je wachtwoord opnieuw in te stellen. Kies een nieuw wachtwoord met de knop hieronder.", cta: "Wachtwoord kiezen", outro: "Deze link is een uur geldig en werkt maar één keer. Heb je dit niet gevraagd? Dan kun je deze e-mail negeren." },
  },
} as const;

function build(kind: keyof typeof COPY, url: string, locale: Locale): RenderedEmail {
  const c = pick(COPY[kind], locale);
  return { subject: c.subject, html: layout({ ...c, url }), text: `${c.title}\n\n${c.intro}\n\n${c.cta} : ${url}\n\n${c.outro}` };
}

export const verifyEmailEmail = ({ url, locale }: { url: string; locale: Locale }) => build("verify", url, locale);
export const resetPasswordEmail = ({ url, locale }: { url: string; locale: Locale }) => build("reset", url, locale);

const ORDER_COPY = {
  fr: { subject: (t: string) => `Vos billets pour ${t}`, hello: (n: string) => `Bonjour ${n},`, intro: (o: string) => `Merci pour votre commande auprès de ${o}. Vos billets sont prêts.`, cta: "Voir mes billets", when: "Quand", where: "Où", online: "En ligne", total: "Total payé", free: "Gratuit", reference: "Référence", outro: "Présentez le QR code de chaque billet à l’entrée, sur votre téléphone ou imprimé. Ce lien est personnel : ne le partagez pas." },
  en: { subject: (t: string) => `Your tickets for ${t}`, hello: (n: string) => `Hi ${n},`, intro: (o: string) => `Thanks for your order with ${o}. Your tickets are ready.`, cta: "View my tickets", when: "When", where: "Where", online: "Online", total: "Total paid", free: "Free", reference: "Reference", outro: "Show each ticket’s QR code at the entrance, on your phone or printed. This link is personal: don’t share it." },
  es: { subject: (t: string) => `Tus entradas para ${t}`, hello: (n: string) => `Hola, ${n}:`, intro: (o: string) => `Gracias por tu pedido a ${o}. Tus entradas están listas.`, cta: "Ver mis entradas", when: "Cuándo", where: "Dónde", online: "Online", total: "Total pagado", free: "Gratis", reference: "Referencia", outro: "Muestra el código QR de cada entrada en el acceso, en el móvil o impreso. Este enlace es personal: no lo compartas." },
  de: { subject: (t: string) => `Ihre Tickets für ${t}`, hello: (n: string) => `Hallo ${n},`, intro: (o: string) => `Vielen Dank für Ihre Bestellung bei ${o}. Ihre Tickets sind bereit.`, cta: "Meine Tickets ansehen", when: "Wann", where: "Wo", online: "Online", total: "Bezahlt", free: "Kostenlos", reference: "Referenz", outro: "Zeigen Sie den QR-Code jedes Tickets am Eingang vor, auf dem Handy oder ausgedruckt. Dieser Link ist persönlich: Geben Sie ihn nicht weiter." },
  it: { subject: (t: string) => `I tuoi biglietti per ${t}`, hello: (n: string) => `Ciao ${n},`, intro: (o: string) => `Grazie per il tuo ordine presso ${o}. I tuoi biglietti sono pronti.`, cta: "Vedi i miei biglietti", when: "Quando", where: "Dove", online: "Online", total: "Totale pagato", free: "Gratuito", reference: "Riferimento", outro: "Mostra il codice QR di ogni biglietto all’ingresso, sul telefono o stampato. Questo link è personale: non condividerlo." },
  pt: { subject: (t: string) => `Os seus bilhetes para ${t}`, hello: (n: string) => `Olá ${n},`, intro: (o: string) => `Obrigado pela sua encomenda a ${o}. Os seus bilhetes estão prontos.`, cta: "Ver os meus bilhetes", when: "Quando", where: "Onde", online: "Online", total: "Total pago", free: "Grátis", reference: "Referência", outro: "Apresente o código QR de cada bilhete à entrada, no telemóvel ou impresso. Este link é pessoal: não o partilhe." },
  nl: { subject: (t: string) => `Je tickets voor ${t}`, hello: (n: string) => `Hallo ${n},`, intro: (o: string) => `Bedankt voor je bestelling bij ${o}. Je tickets staan klaar.`, cta: "Mijn tickets bekijken", when: "Wanneer", where: "Waar", online: "Online", total: "Totaal betaald", free: "Gratis", reference: "Referentie", outro: "Toon de QR-code van elk ticket aan de ingang, op je telefoon of afgedrukt. Deze link is persoonlijk: deel hem niet." },
} as const;

export function orderConfirmationEmail(o: { brand?: EmailBrand | null; locale: Locale; organizationName: string; eventTitle: string; when: string; where: string | null; online: string | null; lines: Array<{ name: string; quantity: number }>; total: string | null; reference: string; url: string; firstName: string }): RenderedEmail {
  const c = pick(ORDER_COPY, o.locale);
  const u = escapeHtml(o.url);
  const row = (label: string, value: string) => `<tr><td style="padding:6px 0;color:#555;font-size:13px;width:110px;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:15px">${escapeHtml(value)}</td></tr>`;
  const details = [row(c.when, o.when), o.where ? row(c.where, o.where) : "", o.online ? row(c.online, o.online) : "", ...o.lines.map((l) => row(`${l.quantity} ×`, l.name)), row(c.total, o.total ?? c.free), row(c.reference, o.reference)].join("");
  const html = `<!doctype html><html><body style="margin:0;background:${palette.creme};font-family:Poppins,Arial,sans-serif;color:${palette.charbon}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${palette.creme};padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${palette.blanc};border-radius:20px;padding:32px">
<tr><td style="font-size:14px;padding-bottom:8px">${brandHeader(o.organizationName, o.brand)}</td></tr>
<tr><td style="font-family:'Archivo Black',Arial Black,Arial,sans-serif;font-size:26px;line-height:1.1;letter-spacing:-0.8px;padding-bottom:12px">${escapeHtml(o.eventTitle)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;padding-bottom:16px">${escapeHtml(c.hello(o.firstName))}<br>${escapeHtml(c.intro(o.organizationName))}</td></tr>
<tr><td style="padding-bottom:20px"><a href="${u}" style="display:inline-block;${brandButton(o.brand)};text-decoration:none;font-weight:600;padding:14px 22px;border-radius:999px">${escapeHtml(c.cta)}</a></td></tr>
<tr><td style="border-top:1px solid #eee;padding-top:12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${details}</table></td></tr>
<tr><td style="font-size:13px;line-height:1.6;color:#555;padding-top:16px">${escapeHtml(c.outro)}<br><a href="${u}" style="color:${palette.charbon};word-break:break-all">${u}</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = [o.organizationName, o.eventTitle, "", c.hello(o.firstName), c.intro(o.organizationName), "", `${c.cta} : ${o.url}`, "", `${c.when} : ${o.when}`, o.where ? `${c.where} : ${o.where}` : "", o.online ? `${c.online} : ${o.online}` : "", ...o.lines.map((l) => `${l.quantity} × ${l.name}`), `${c.total} : ${o.total ?? c.free}`, `${c.reference} : ${o.reference}`, "", c.outro].filter((l) => l !== "").join("\n");
  return { subject: c.subject(o.eventTitle), html, text };
}

const LOOKUP_COPY = {
  fr: { subject: "Vos billets", title: "Vos billets", intro: "Voici les liens vers vos billets pour les événements à venir. Chaque lien est personnel.", cta: "Voir mes billets", outro: "Vous n’avez rien demandé ? Ignorez cet e-mail : personne d’autre n’a reçu ces liens." },
  en: { subject: "Your tickets", title: "Your tickets", intro: "Here are the links to your tickets for upcoming events. Each link is personal.", cta: "View my tickets", outro: "Didn’t ask for this? Ignore this email: nobody else received these links." },
  es: { subject: "Tus entradas", title: "Tus entradas", intro: "Aquí tienes los enlaces a tus entradas para los próximos eventos. Cada enlace es personal.", cta: "Ver mis entradas", outro: "¿No lo has pedido tú? Ignora este e-mail: nadie más ha recibido estos enlaces." },
  de: { subject: "Ihre Tickets", title: "Ihre Tickets", intro: "Hier sind die Links zu Ihren Tickets für kommende Veranstaltungen. Jeder Link ist persönlich.", cta: "Meine Tickets ansehen", outro: "Sie haben das nicht angefordert? Ignorieren Sie diese E-Mail: Niemand sonst hat diese Links erhalten." },
  it: { subject: "I tuoi biglietti", title: "I tuoi biglietti", intro: "Ecco i link ai tuoi biglietti per i prossimi eventi. Ogni link è personale.", cta: "Vedi i miei biglietti", outro: "Non l’hai richiesto tu? Ignora questa e-mail: nessun altro ha ricevuto questi link." },
  pt: { subject: "Os seus bilhetes", title: "Os seus bilhetes", intro: "Eis os links para os bilhetes dos seus próximos eventos. Cada link é pessoal.", cta: "Ver os meus bilhetes", outro: "Não foi você que pediu? Ignore este e-mail: mais ninguém recebeu estes links." },
  nl: { subject: "Je tickets", title: "Je tickets", intro: "Hier zijn de links naar je tickets voor komende evenementen. Elke link is persoonlijk.", cta: "Mijn tickets bekijken", outro: "Niet aangevraagd? Negeer deze e-mail: niemand anders heeft deze links ontvangen." },
} as const;

/** RG-POST-02 : liens vers les commandes à venir d'une adresse. */
export function ticketsLookupEmail(o: { brand?: EmailBrand | null; locale: Locale; organizationName: string; orders: Array<{ eventTitle: string; when: string; url: string }> }): RenderedEmail {
  const c = pick(LOOKUP_COPY, o.locale);
  const items = o.orders
    .map((x) => `<tr><td style="padding:12px 0;border-top:1px solid #eee"><div style="font-weight:600;font-size:15px">${escapeHtml(x.eventTitle)}</div><div style="font-size:13px;color:#555;padding-bottom:8px">${escapeHtml(x.when)}</div><a href="${escapeHtml(x.url)}" style="display:inline-block;${brandButton(o.brand)};text-decoration:none;font-weight:600;padding:10px 18px;border-radius:999px;font-size:14px">${escapeHtml(c.cta)}</a></td></tr>`)
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:${palette.creme};font-family:Poppins,Arial,sans-serif;color:${palette.charbon}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${palette.creme};padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${palette.blanc};border-radius:20px;padding:32px">
<tr><td style="font-size:14px;padding-bottom:8px">${brandHeader(o.organizationName, o.brand)}</td></tr>
<tr><td style="font-family:'Archivo Black',Arial Black,Arial,sans-serif;font-size:26px;letter-spacing:-0.8px;padding-bottom:12px">${escapeHtml(c.title)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;padding-bottom:12px">${escapeHtml(c.intro)}</td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table></td></tr>
<tr><td style="font-size:13px;line-height:1.6;color:#555;padding-top:16px">${escapeHtml(c.outro)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [o.organizationName, c.title, "", c.intro, "", ...o.orders.flatMap((x) => [`${x.eventTitle} (${x.when})`, x.url, ""]), c.outro].join("\n");
  return { subject: c.subject, html, text };
}

const RESALE_COPY = {
  fr: {
    SOLD: { subject: (e: string) => `Votre place pour ${e} est revendue`, body: (a: string | null) => (a ? `Votre place a trouvé preneur. ${a} vous sont remboursés sur votre moyen de paiement d’origine : comptez quelques jours selon votre banque. Votre ancien billet n’est plus valable.` : "Votre place a été transférée à son nouveau titulaire. Votre ancien billet n’est plus valable.") },
    CANCELLED: { subject: (e: string) => `Votre annonce de revente pour ${e} est retirée`, body: () => "La revente a été retirée par l’organisateur. Votre billet reste valable : vous pouvez l’utiliser normalement." },
    EXPIRED: { subject: (e: string) => `La revente de votre place pour ${e} est terminée`, body: () => "La période de revente est terminée sans que votre place ne trouve preneur. Votre billet reste valable." },
    hello: (n: string) => `Bonjour ${n},`,
  },
  en: {
    SOLD: { subject: (e: string) => `Your spot for ${e} has been resold`, body: (a: string | null) => (a ? `Your spot found a buyer. ${a} is being refunded to your original payment method: allow a few days depending on your bank. Your old ticket is no longer valid.` : "Your spot has been transferred to its new holder. Your old ticket is no longer valid.") },
    CANCELLED: { subject: (e: string) => `Your resale listing for ${e} was withdrawn`, body: () => "The organiser withdrew the resale. Your ticket is still valid: you can use it as usual." },
    EXPIRED: { subject: (e: string) => `The resale of your spot for ${e} has ended`, body: () => "The resale period ended without a buyer for your spot. Your ticket is still valid." },
    hello: (n: string) => `Hi ${n},`,
  },
  es: {
    SOLD: { subject: (e: string) => `Tu plaza para ${e} se ha revendido`, body: (a: string | null) => (a ? `Tu plaza ha encontrado comprador. Se te reembolsan ${a} en tu método de pago original: cuenta unos días según tu banco. Tu entrada antigua ya no es válida.` : "Tu plaza se ha transferido a su nuevo titular. Tu entrada antigua ya no es válida.") },
    CANCELLED: { subject: (e: string) => `Tu anuncio de reventa para ${e} se ha retirado`, body: () => "El organizador ha retirado la reventa. Tu entrada sigue siendo válida: puedes usarla con normalidad." },
    EXPIRED: { subject: (e: string) => `La reventa de tu plaza para ${e} ha terminado`, body: () => "El periodo de reventa ha terminado sin comprador para tu plaza. Tu entrada sigue siendo válida." },
    hello: (n: string) => `Hola, ${n}:`,
  },
  de: {
    SOLD: { subject: (e: string) => `Ihr Platz für ${e} wurde weiterverkauft`, body: (a: string | null) => (a ? `Ihr Platz hat einen Käufer gefunden. ${a} werden auf Ihr ursprüngliches Zahlungsmittel erstattet: Je nach Bank dauert das einige Tage. Ihr altes Ticket ist nicht mehr gültig.` : "Ihr Platz wurde auf seinen neuen Inhaber übertragen. Ihr altes Ticket ist nicht mehr gültig.") },
    CANCELLED: { subject: (e: string) => `Ihr Weiterverkaufsangebot für ${e} wurde zurückgezogen`, body: () => "Der Veranstalter hat den Weiterverkauf zurückgezogen. Ihr Ticket bleibt gültig: Sie können es wie gewohnt nutzen." },
    EXPIRED: { subject: (e: string) => `Der Weiterverkauf Ihres Platzes für ${e} ist beendet`, body: () => "Der Weiterverkaufszeitraum ist ohne Käufer für Ihren Platz zu Ende gegangen. Ihr Ticket bleibt gültig." },
    hello: (n: string) => `Hallo ${n},`,
  },
  it: {
    SOLD: { subject: (e: string) => `Il tuo posto per ${e} è stato rivenduto`, body: (a: string | null) => (a ? `Il tuo posto ha trovato un acquirente. Ti vengono rimborsati ${a} sul metodo di pagamento originale: calcola qualche giorno a seconda della banca. Il tuo vecchio biglietto non è più valido.` : "Il tuo posto è stato trasferito al nuovo titolare. Il tuo vecchio biglietto non è più valido.") },
    CANCELLED: { subject: (e: string) => `Il tuo annuncio di rivendita per ${e} è stato ritirato`, body: () => "L’organizzatore ha ritirato la rivendita. Il tuo biglietto resta valido: puoi usarlo normalmente." },
    EXPIRED: { subject: (e: string) => `La rivendita del tuo posto per ${e} è terminata`, body: () => "Il periodo di rivendita è terminato senza acquirenti per il tuo posto. Il tuo biglietto resta valido." },
    hello: (n: string) => `Ciao ${n},`,
  },
  pt: {
    SOLD: { subject: (e: string) => `O seu lugar para ${e} foi revendido`, body: (a: string | null) => (a ? `O seu lugar encontrou comprador. Vão ser-lhe reembolsados ${a} no seu meio de pagamento original: conte com alguns dias, consoante o seu banco. O seu bilhete antigo já não é válido.` : "O seu lugar foi transferido para o novo titular. O seu bilhete antigo já não é válido.") },
    CANCELLED: { subject: (e: string) => `O seu anúncio de revenda para ${e} foi retirado`, body: () => "O organizador retirou a revenda. O seu bilhete continua válido: pode usá-lo normalmente." },
    EXPIRED: { subject: (e: string) => `A revenda do seu lugar para ${e} terminou`, body: () => "O período de revenda terminou sem comprador para o seu lugar. O seu bilhete continua válido." },
    hello: (n: string) => `Olá ${n},`,
  },
  nl: {
    SOLD: { subject: (e: string) => `Je plaats voor ${e} is doorverkocht`, body: (a: string | null) => (a ? `Je plaats heeft een koper gevonden. ${a} wordt terugbetaald op je oorspronkelijke betaalmethode: reken op enkele dagen, afhankelijk van je bank. Je oude ticket is niet meer geldig.` : "Je plaats is overgedragen aan de nieuwe houder. Je oude ticket is niet meer geldig.") },
    CANCELLED: { subject: (e: string) => `Je doorverkoopaanbod voor ${e} is ingetrokken`, body: () => "De organisator heeft de doorverkoop ingetrokken. Je ticket blijft geldig: je kunt het gewoon gebruiken." },
    EXPIRED: { subject: (e: string) => `De doorverkoop van je plaats voor ${e} is afgelopen`, body: () => "De doorverkoopperiode is afgelopen zonder koper voor je plaats. Je ticket blijft geldig." },
    hello: (n: string) => `Hallo ${n},`,
  },
} as const;

/** E-mails au vendeur : place revendue et montant remboursé, annonce retirée, revente terminée. */
export function resaleSellerEmail(o: { brand?: EmailBrand | null; kind: "SOLD" | "CANCELLED" | "EXPIRED"; locale: Locale; organizationName: string; eventTitle: string; firstName: string; amount: string | null }): RenderedEmail {
  const c = pick(RESALE_COPY, o.locale);
  const k = c[o.kind];
  const body = o.kind === "SOLD" ? c.SOLD.body(o.amount) : k.body(null);
  const html = `<!doctype html><html><body style="margin:0;background:${palette.creme};font-family:Poppins,Arial,sans-serif;color:${palette.charbon}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${palette.creme};padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${palette.blanc};border-radius:20px;padding:32px">
<tr><td style="font-size:14px;padding-bottom:8px">${brandHeader(o.organizationName, o.brand)}</td></tr>
<tr><td style="font-family:'Archivo Black',Arial Black,Arial,sans-serif;font-size:24px;line-height:1.15;letter-spacing:-0.6px;padding-bottom:12px">${escapeHtml(k.subject(o.eventTitle))}</td></tr>
<tr><td style="font-size:15px;line-height:1.6">${escapeHtml(c.hello(o.firstName))}<br>${escapeHtml(body)}</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: k.subject(o.eventTitle), html, text: [o.organizationName, "", c.hello(o.firstName), body].join("\n") };
}

const REFUND_COPY = {
  fr: {
    PROCESSED: { subject: (e: string) => `Remboursement pour ${e}`, body: (a: string | null, n: number) => (a ? `Le remboursement de ${n > 1 ? `${n} billets` : "votre billet"} est en cours : ${a} sur votre moyen de paiement d’origine, sous quelques jours selon votre banque. Ces billets ne sont plus valables.` : `${n > 1 ? `Vos ${n} billets sont annulés` : "Votre billet est annulé"}. Ils ne sont plus valables.`) },
    REJECTED: { subject: (e: string) => `Votre demande de remboursement pour ${e}`, body: () => "L’organisateur n’a pas accepté votre demande de remboursement. Vos billets restent valables." },
    CANCELLED: { subject: (e: string) => `Événement annulé : ${e}`, body: (a: string | null) => (a ? `L’organisateur a annulé l’événement. Vous êtes remboursé intégralement, sans rien faire : ${a} sur votre moyen de paiement d’origine, sous quelques jours selon votre banque.` : "L’organisateur a annulé l’événement. Vos billets ne sont plus valables.") },
    hello: (n: string) => `Bonjour ${n},`,
    reason: "Message de l’organisateur :",
  },
  en: {
    PROCESSED: { subject: (e: string) => `Refund for ${e}`, body: (a: string | null, n: number) => (a ? `The refund for ${n > 1 ? `${n} tickets` : "your ticket"} is on its way: ${a} to your original payment method, within a few days depending on your bank. These tickets are no longer valid.` : `${n > 1 ? `Your ${n} tickets are cancelled` : "Your ticket is cancelled"}. They're no longer valid.`) },
    REJECTED: { subject: (e: string) => `Your refund request for ${e}`, body: () => "The organiser didn’t accept your refund request. Your tickets are still valid." },
    CANCELLED: { subject: (e: string) => `Event cancelled: ${e}`, body: (a: string | null) => (a ? `The organiser cancelled the event. You’re refunded in full with nothing to do: ${a} to your original payment method, within a few days depending on your bank.` : "The organiser cancelled the event. Your tickets are no longer valid.") },
    hello: (n: string) => `Hi ${n},`,
    reason: "Message from the organiser:",
  },
  es: {
    PROCESSED: { subject: (e: string) => `Reembolso de ${e}`, body: (a: string | null, n: number) => (a ? `El reembolso de ${n > 1 ? `tus ${n} entradas` : "tu entrada"} está en camino: ${a} en tu método de pago original, en unos días según tu banco. ${n > 1 ? "Estas entradas ya no son válidas." : "Esta entrada ya no es válida."}` : n > 1 ? `Tus ${n} entradas se han cancelado. Ya no son válidas.` : "Tu entrada se ha cancelado. Ya no es válida.") },
    REJECTED: { subject: (e: string) => `Tu solicitud de reembolso para ${e}`, body: () => "El organizador no ha aceptado tu solicitud de reembolso. Tus entradas siguen siendo válidas." },
    CANCELLED: { subject: (e: string) => `Evento cancelado: ${e}`, body: (a: string | null) => (a ? `El organizador ha cancelado el evento. Se te reembolsa íntegramente sin que tengas que hacer nada: ${a} en tu método de pago original, en unos días según tu banco.` : "El organizador ha cancelado el evento. Tus entradas ya no son válidas.") },
    hello: (n: string) => `Hola, ${n}:`,
    reason: "Mensaje del organizador:",
  },
  de: {
    PROCESSED: { subject: (e: string) => `Erstattung für ${e}`, body: (a: string | null, n: number) => (a ? `Die Erstattung für ${n > 1 ? `Ihre ${n} Tickets` : "Ihr Ticket"} ist unterwegs: ${a} auf Ihr ursprüngliches Zahlungsmittel, je nach Bank innerhalb einiger Tage. ${n > 1 ? "Diese Tickets sind nicht mehr gültig." : "Dieses Ticket ist nicht mehr gültig."}` : n > 1 ? `Ihre ${n} Tickets wurden storniert. Sie sind nicht mehr gültig.` : "Ihr Ticket wurde storniert. Es ist nicht mehr gültig.") },
    REJECTED: { subject: (e: string) => `Ihre Erstattungsanfrage für ${e}`, body: () => "Der Veranstalter hat Ihre Erstattungsanfrage nicht angenommen. Ihre Tickets bleiben gültig." },
    CANCELLED: { subject: (e: string) => `Veranstaltung abgesagt: ${e}`, body: (a: string | null) => (a ? `Der Veranstalter hat die Veranstaltung abgesagt. Sie erhalten den vollen Betrag zurück, ohne etwas tun zu müssen: ${a} auf Ihr ursprüngliches Zahlungsmittel, je nach Bank innerhalb einiger Tage.` : "Der Veranstalter hat die Veranstaltung abgesagt. Ihre Tickets sind nicht mehr gültig.") },
    hello: (n: string) => `Hallo ${n},`,
    reason: "Nachricht des Veranstalters:",
  },
  it: {
    PROCESSED: { subject: (e: string) => `Rimborso per ${e}`, body: (a: string | null, n: number) => (a ? `Il rimborso per ${n > 1 ? `i tuoi ${n} biglietti` : "il tuo biglietto"} è in arrivo: ${a} sul metodo di pagamento originale, entro qualche giorno a seconda della banca. ${n > 1 ? "Questi biglietti non sono più validi." : "Questo biglietto non è più valido."}` : n > 1 ? `I tuoi ${n} biglietti sono stati annullati. Non sono più validi.` : "Il tuo biglietto è stato annullato. Non è più valido.") },
    REJECTED: { subject: (e: string) => `La tua richiesta di rimborso per ${e}`, body: () => "L’organizzatore non ha accettato la tua richiesta di rimborso. I tuoi biglietti restano validi." },
    CANCELLED: { subject: (e: string) => `Evento annullato: ${e}`, body: (a: string | null) => (a ? `L’organizzatore ha annullato l’evento. Vieni rimborsato per intero senza dover fare nulla: ${a} sul metodo di pagamento originale, entro qualche giorno a seconda della banca.` : "L’organizzatore ha annullato l’evento. I tuoi biglietti non sono più validi.") },
    hello: (n: string) => `Ciao ${n},`,
    reason: "Messaggio dell’organizzatore:",
  },
  pt: {
    PROCESSED: { subject: (e: string) => `Reembolso de ${e}`, body: (a: string | null, n: number) => (a ? `O reembolso ${n > 1 ? `dos seus ${n} bilhetes` : "do seu bilhete"} está a caminho: ${a} no seu meio de pagamento original, dentro de alguns dias, consoante o seu banco. ${n > 1 ? "Estes bilhetes já não são válidos." : "Este bilhete já não é válido."}` : n > 1 ? `Os seus ${n} bilhetes foram cancelados. Já não são válidos.` : "O seu bilhete foi cancelado. Já não é válido.") },
    REJECTED: { subject: (e: string) => `O seu pedido de reembolso para ${e}`, body: () => "O organizador não aceitou o seu pedido de reembolso. Os seus bilhetes continuam válidos." },
    CANCELLED: { subject: (e: string) => `Evento cancelado: ${e}`, body: (a: string | null) => (a ? `O organizador cancelou o evento. É reembolsado na totalidade, sem ter nada a fazer: ${a} no seu meio de pagamento original, dentro de alguns dias, consoante o seu banco.` : "O organizador cancelou o evento. Os seus bilhetes já não são válidos.") },
    hello: (n: string) => `Olá ${n},`,
    reason: "Mensagem do organizador:",
  },
  nl: {
    PROCESSED: { subject: (e: string) => `Terugbetaling voor ${e}`, body: (a: string | null, n: number) => (a ? `De terugbetaling voor ${n > 1 ? `je ${n} tickets` : "je ticket"} is onderweg: ${a} op je oorspronkelijke betaalmethode, binnen enkele dagen afhankelijk van je bank. ${n > 1 ? "Deze tickets zijn niet meer geldig." : "Dit ticket is niet meer geldig."}` : n > 1 ? `Je ${n} tickets zijn geannuleerd. Ze zijn niet meer geldig.` : "Je ticket is geannuleerd. Het is niet meer geldig.") },
    REJECTED: { subject: (e: string) => `Je aanvraag tot terugbetaling voor ${e}`, body: () => "De organisator heeft je aanvraag tot terugbetaling niet aanvaard. Je tickets blijven geldig." },
    CANCELLED: { subject: (e: string) => `Evenement geannuleerd: ${e}`, body: (a: string | null) => (a ? `De organisator heeft het evenement geannuleerd. Je krijgt alles terug zonder iets te hoeven doen: ${a} op je oorspronkelijke betaalmethode, binnen enkele dagen afhankelijk van je bank.` : "De organisator heeft het evenement geannuleerd. Je tickets zijn niet meer geldig.") },
    hello: (n: string) => `Hallo ${n},`,
    reason: "Bericht van de organisator:",
  },
} as const;

/** E-mails de remboursement (section 9.14) : remboursement envoyé, demande refusée, événement annulé. */
export function refundEmail(o: { brand?: EmailBrand | null; kind: "PROCESSED" | "REJECTED" | "CANCELLED"; locale: Locale; organizationName: string; eventTitle: string; firstName: string; amount: string | null; count: number; message?: string | null }): RenderedEmail {
  const c = pick(REFUND_COPY, o.locale);
  const subject = c[o.kind].subject(o.eventTitle);
  const body = o.kind === "PROCESSED" ? c.PROCESSED.body(o.amount, o.count) : o.kind === "CANCELLED" ? c.CANCELLED.body(o.amount) : c.REJECTED.body();
  const note = o.message ? `<tr><td style="font-size:14px;line-height:1.6;padding-top:12px;color:#555">${escapeHtml(c.reason)}<br>${escapeHtml(o.message)}</td></tr>` : "";
  const html = `<!doctype html><html><body style="margin:0;background:${palette.creme};font-family:Poppins,Arial,sans-serif;color:${palette.charbon}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${palette.creme};padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${palette.blanc};border-radius:20px;padding:32px">
<tr><td style="font-size:14px;padding-bottom:8px">${brandHeader(o.organizationName, o.brand)}</td></tr>
<tr><td style="font-family:'Archivo Black',Arial Black,Arial,sans-serif;font-size:24px;line-height:1.15;letter-spacing:-0.6px;padding-bottom:12px">${escapeHtml(subject)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6">${escapeHtml(c.hello(o.firstName))}<br>${escapeHtml(body)}</td></tr>${note}
</table></td></tr></table></body></html>`;
  return { subject, html, text: [o.organizationName, "", c.hello(o.firstName), body, o.message ? `\n${c.reason}\n${o.message}` : ""].filter(Boolean).join("\n") };
}

const SUB_COPY = {
  fr: {
    STARTED: { subject: "Bienvenue dans Evoly Pro", body: "Votre organisation est passée en Pro : commission plafonnée à 1 € par billet, prix dynamiques, marque personnalisée et équipe. Vous pouvez gérer votre abonnement à tout moment." },
    TRIAL_ENDING: { subject: "Votre essai Pro se termine dans 3 jours", body: "Sans action de votre part, votre abonnement démarrera automatiquement à la fin de l’essai. Vous pouvez changer de formule ou résilier depuis la page Abonnement." },
    PAYMENT_FAILED: { subject: "Le paiement de votre abonnement Pro a échoué", body: "Stripe va réessayer automatiquement. Mettez à jour votre moyen de paiement pour éviter le retour en Free, qui interviendra 7 jours après le premier échec." },
    ENDED: { subject: "Votre organisation est repassée en Free", body: "Rien n’est supprimé : vos événements, vos réglages de marque et vos paliers de prix sont conservés. La commission est de nouveau plafonnée à 2,50 €, la marque Evoly s’affiche, les paliers des événements publiés restent appliqués sans modification possible, et les membres autres que le propriétaire n’ont plus accès. Tout revient en repassant en Pro." },
    cta: "Gérer mon abonnement",
    hello: (n: string) => `Bonjour ${n},`,
  },
  en: {
    STARTED: { subject: "Welcome to Evoly Pro", body: "Your organisation is now on Pro: fee capped at €1 per ticket, dynamic pricing, custom branding and team. You can manage your subscription at any time." },
    TRIAL_ENDING: { subject: "Your Pro trial ends in 3 days", body: "If you do nothing, your subscription starts automatically when the trial ends. You can switch plans or cancel from the Billing page." },
    PAYMENT_FAILED: { subject: "Your Pro subscription payment failed", body: "Stripe will retry automatically. Update your payment method to avoid returning to Free, which happens 7 days after the first failure." },
    ENDED: { subject: "Your organisation is back on Free", body: "Nothing is deleted: your events, branding settings and price tiers are kept. The fee is capped at €2.50 again, the Evoly brand shows, tiers on published events keep applying but can't be edited, and members other than the owner lose access. Everything comes back when you return to Pro." },
    cta: "Manage my subscription",
    hello: (n: string) => `Hi ${n},`,
  },
} as const;

/** E-mails de l'abonnement Pro (RG-SUB-03, RG-SUB-06, RG-SUB-08). */
export function subscriptionEmail(o: { kind: "STARTED" | "TRIAL_ENDING" | "PAYMENT_FAILED" | "ENDED"; locale: Locale; organizationName: string; firstName: string; url: string }): RenderedEmail {
  const c = pick(SUB_COPY, o.locale);
  const k = c[o.kind];
  const u = escapeHtml(o.url);
  const html = `<!doctype html><html><body style="margin:0;background:${palette.creme};font-family:Poppins,Arial,sans-serif;color:${palette.charbon}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${palette.creme};padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${palette.blanc};border-radius:20px;padding:32px">
<tr><td style="font-family:'Archivo Black',Arial Black,Arial,sans-serif;font-size:22px;letter-spacing:-0.5px;padding-bottom:16px">evoly</td></tr>
<tr><td style="font-size:14px;padding-bottom:8px">${escapeHtml(o.organizationName)}</td></tr>
<tr><td style="font-family:'Archivo Black',Arial Black,Arial,sans-serif;font-size:24px;line-height:1.15;letter-spacing:-0.6px;padding-bottom:12px">${escapeHtml(k.subject)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;padding-bottom:24px">${escapeHtml(c.hello(o.firstName))}<br>${escapeHtml(k.body)}</td></tr>
<tr><td><a href="${u}" style="display:inline-block;background:${palette.rose};color:${palette.charbon};text-decoration:none;font-weight:600;padding:14px 22px;border-radius:999px">${escapeHtml(c.cta)}</a></td></tr>
</table></td></tr></table></body></html>`;
  return { subject: k.subject, html, text: [o.organizationName, "", c.hello(o.firstName), k.body, "", `${c.cta} : ${o.url}`].join("\n") };
}

/** En-tête des e-mails aux acheteurs : logo de l'organisation (Pro) ou son nom. */
function brandHeader(name: string, brand?: EmailBrand | null): string {
  return brand?.logoUrl ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(name)}" height="40" style="height:40px;width:auto;border:0;display:block">` : escapeHtml(name);
}

/** Boutons des e-mails aux acheteurs : couleur d'accent de l'organisation (Pro), texte lisible (RG-BRD-01). */
function brandButton(brand?: EmailBrand | null): string {
  return brand?.accent ? `background:${brand.accent};color:${brand.accentInk}` : `background:${palette.rose};color:${palette.charbon}`;
}

const REMINDER_COPY = {
  fr: {
    REMINDER_J7: (e: string) => `Plus qu’une semaine avant ${e}`,
    REMINDER_J1: (e: string) => `C’est demain : ${e}`,
    REMINDER_J0: (e: string) => `C’est aujourd’hui : ${e}`,
    hello: (n: string) => `Bonjour ${n},`,
    body: (n: number) => (n > 1 ? `Vos ${n} billets sont prêts : présentez un QR code par personne à l’entrée.` : "Votre billet est prêt : présentez son QR code à l’entrée."),
    cta: "Voir mes billets",
    when: "Quand",
    where: "Où",
    reason: (org: string, e: string) => `Vous recevez cet e-mail car vous avez un billet pour ${e}, organisé par ${org}.`,
    unsubscribe: "Ne plus recevoir de rappels pour cet événement",
  },
  en: {
    REMINDER_J7: (e: string) => `One week to go: ${e}`,
    REMINDER_J1: (e: string) => `It’s tomorrow: ${e}`,
    REMINDER_J0: (e: string) => `It’s today: ${e}`,
    hello: (n: string) => `Hi ${n},`,
    body: (n: number) => (n > 1 ? `Your ${n} tickets are ready: show one QR code per person at the entrance.` : "Your ticket is ready: show its QR code at the entrance."),
    cta: "See my tickets",
    when: "When",
    where: "Where",
    reason: (org: string, e: string) => `You’re receiving this email because you have a ticket for ${e}, organised by ${org}.`,
    unsubscribe: "Stop reminders for this event",
  },
  es: { REMINDER_J7: (e: string) => `Falta una semana: ${e}`, REMINDER_J1: (e: string) => `Es mañana: ${e}`, REMINDER_J0: (e: string) => `Es hoy: ${e}`, hello: (n: string) => `Hola, ${n}:`, body: (n: number) => (n > 1 ? `Tus ${n} entradas están listas: muestra un código QR por persona en el acceso.` : "Tu entrada está lista: muestra su código QR en el acceso."), cta: "Ver mis entradas", when: "Cuándo", where: "Dónde", reason: (org: string, e: string) => `Recibes este e-mail porque tienes una entrada para ${e}, organizado por ${org}.`, unsubscribe: "Dejar de recibir recordatorios de este evento" },
  de: { REMINDER_J7: (e: string) => `Noch eine Woche: ${e}`, REMINDER_J1: (e: string) => `Morgen ist es so weit: ${e}`, REMINDER_J0: (e: string) => `Heute ist es so weit: ${e}`, hello: (n: string) => `Hallo ${n},`, body: (n: number) => (n > 1 ? `Ihre ${n} Tickets sind bereit: Zeigen Sie am Eingang einen QR-Code pro Person vor.` : "Ihr Ticket ist bereit: Zeigen Sie seinen QR-Code am Eingang vor."), cta: "Meine Tickets ansehen", when: "Wann", where: "Wo", reason: (org: string, e: string) => `Sie erhalten diese E-Mail, weil Sie ein Ticket für ${e} haben, veranstaltet von ${org}.`, unsubscribe: "Keine Erinnerungen mehr für diese Veranstaltung" },
  it: { REMINDER_J7: (e: string) => `Manca una settimana: ${e}`, REMINDER_J1: (e: string) => `È domani: ${e}`, REMINDER_J0: (e: string) => `È oggi: ${e}`, hello: (n: string) => `Ciao ${n},`, body: (n: number) => (n > 1 ? `I tuoi ${n} biglietti sono pronti: mostra un codice QR per persona all’ingresso.` : "Il tuo biglietto è pronto: mostra il suo codice QR all’ingresso."), cta: "Vedi i miei biglietti", when: "Quando", where: "Dove", reason: (org: string, e: string) => `Ricevi questa e-mail perché hai un biglietto per ${e}, organizzato da ${org}.`, unsubscribe: "Non ricevere più promemoria per questo evento" },
  pt: { REMINDER_J7: (e: string) => `Falta uma semana: ${e}`, REMINDER_J1: (e: string) => `É amanhã: ${e}`, REMINDER_J0: (e: string) => `É hoje: ${e}`, hello: (n: string) => `Olá ${n},`, body: (n: number) => (n > 1 ? `Os seus ${n} bilhetes estão prontos: apresente um código QR por pessoa à entrada.` : "O seu bilhete está pronto: apresente o código QR à entrada."), cta: "Ver os meus bilhetes", when: "Quando", where: "Onde", reason: (org: string, e: string) => `Recebe este e-mail porque tem um bilhete para ${e}, organizado por ${org}.`, unsubscribe: "Deixar de receber lembretes deste evento" },
  nl: { REMINDER_J7: (e: string) => `Nog een week: ${e}`, REMINDER_J1: (e: string) => `Het is morgen: ${e}`, REMINDER_J0: (e: string) => `Het is vandaag: ${e}`, hello: (n: string) => `Hallo ${n},`, body: (n: number) => (n > 1 ? `Je ${n} tickets staan klaar: toon aan de ingang één QR-code per persoon.` : "Je ticket staat klaar: toon de QR-code aan de ingang."), cta: "Mijn tickets bekijken", when: "Wanneer", where: "Waar", reason: (org: string, e: string) => `Je ontvangt deze e-mail omdat je een ticket hebt voor ${e}, georganiseerd door ${org}.`, unsubscribe: "Geen herinneringen meer voor dit evenement" },
} as const;

/** US-MKT-01 : rappels J-7, J-1 et jour J (e-mails de service), pied de page obligatoire (RG-MKT-02). */
export function reminderEmail(o: { brand?: EmailBrand | null; locale: Locale; type: "REMINDER_J7" | "REMINDER_J1" | "REMINDER_J0"; organizationName: string; organizationAddress: string; firstName: string; eventTitle: string; when: string; where: string; tickets: number; ticketsUrl: string; unsubscribeEventUrl: string }): RenderedEmail {
  const c = pick(REMINDER_COPY, o.locale);
  const subject = c[o.type](o.eventTitle);
  const row = (k: string, v: string) => (v ? `<tr><td style="padding:6px 16px 6px 0;color:#555;font-size:14px;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 0;font-size:14px">${escapeHtml(v)}</td></tr>` : "");
  const footer = `${escapeHtml(o.organizationName)}${o.organizationAddress ? ` · ${escapeHtml(o.organizationAddress)}` : ""}<br>${escapeHtml(c.reason(o.organizationName, o.eventTitle))}<br><a href="${escapeHtml(o.unsubscribeEventUrl)}" style="color:#555">${escapeHtml(c.unsubscribe)}</a>`;
  const html = `<!doctype html><html><body style="margin:0;background:${palette.creme};font-family:Poppins,Arial,sans-serif;color:${palette.charbon}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${palette.creme};padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${palette.blanc};border-radius:20px;padding:32px">
<tr><td style="font-size:14px;padding-bottom:8px">${brandHeader(o.organizationName, o.brand)}</td></tr>
<tr><td style="font-family:'Archivo Black',Arial Black,Arial,sans-serif;font-size:24px;line-height:1.15;letter-spacing:-0.6px;padding-bottom:12px">${escapeHtml(subject)}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;padding-bottom:20px">${escapeHtml(c.hello(o.firstName))}<br>${escapeHtml(c.body(o.tickets))}</td></tr>
<tr><td style="padding-bottom:20px"><table role="presentation" cellpadding="0" cellspacing="0">${row(c.when, o.when)}${row(c.where, o.where)}</table></td></tr>
<tr><td style="padding-bottom:24px"><a href="${escapeHtml(o.ticketsUrl)}" style="display:inline-block;${brandButton(o.brand)};text-decoration:none;font-weight:600;padding:14px 22px;border-radius:999px">${escapeHtml(c.cta)}</a></td></tr>
<tr><td style="border-top:1px solid #eee;padding-top:16px;font-size:12px;line-height:1.6;color:#555">${footer}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [o.organizationName, "", c.hello(o.firstName), c.body(o.tickets), "", `${c.when} : ${o.when}`, o.where ? `${c.where} : ${o.where}` : "", "", `${c.cta} : ${o.ticketsUrl}`, "", "—", c.reason(o.organizationName, o.eventTitle), `${c.unsubscribe} : ${o.unsubscribeEventUrl}`].filter((l) => l !== undefined).join("\n");
  return { subject, html, text };
}

const SEAT_COPY = {
  fr: { subject: (e: string) => `Votre place a changé : ${e}`, hello: (n: string) => `Bonjour ${n},`, body: (from: string, to: string) => `L’organisateur vous a attribué une nouvelle place : ${to}, au lieu de ${from}. Votre billet est mis à jour : utilisez la nouvelle version.`, cta: "Voir mes billets" },
  en: { subject: (e: string) => `Your seat has changed: ${e}`, hello: (n: string) => `Hi ${n},`, body: (from: string, to: string) => `The organiser gave you a new seat: ${to}, instead of ${from}. Your ticket has been updated: please use the new version.`, cta: "View my tickets" },
  es: { subject: (e: string) => `Tu plaza ha cambiado: ${e}`, hello: (n: string) => `Hola, ${n}:`, body: (from: string, to: string) => `El organizador te ha asignado una nueva plaza: ${to}, en lugar de ${from}. Tu entrada se ha actualizado: usa la nueva versión.`, cta: "Ver mis entradas" },
  de: { subject: (e: string) => `Ihr Platz hat sich geändert: ${e}`, hello: (n: string) => `Hallo ${n},`, body: (from: string, to: string) => `Der Veranstalter hat Ihnen einen neuen Platz zugewiesen: ${to} statt ${from}. Ihr Ticket wurde aktualisiert: Bitte verwenden Sie die neue Version.`, cta: "Meine Tickets ansehen" },
  it: { subject: (e: string) => `Il tuo posto è cambiato: ${e}`, hello: (n: string) => `Ciao ${n},`, body: (from: string, to: string) => `L’organizzatore ti ha assegnato un nuovo posto: ${to}, invece di ${from}. Il tuo biglietto è stato aggiornato: usa la nuova versione.`, cta: "Vedi i miei biglietti" },
  pt: { subject: (e: string) => `O seu lugar mudou: ${e}`, hello: (n: string) => `Olá ${n},`, body: (from: string, to: string) => `O organizador atribuiu-lhe um novo lugar: ${to}, em vez de ${from}. O seu bilhete foi atualizado: use a nova versão.`, cta: "Ver os meus bilhetes" },
  nl: { subject: (e: string) => `Je plaats is gewijzigd: ${e}`, hello: (n: string) => `Hallo ${n},`, body: (from: string, to: string) => `De organisator heeft je een nieuwe plaats gegeven: ${to}, in plaats van ${from}. Je ticket is bijgewerkt: gebruik de nieuwe versie.`, cta: "Mijn tickets bekijken" },
} as const;

/** Section 9.9 : l'organisateur a changé l'acheteur de place ; lien vers les billets mis à jour. */
export function seatChangedEmail(o: { brand?: EmailBrand | null; locale: Locale; organizationName: string; eventTitle: string; firstName: string; from: string; to: string; url: string }): RenderedEmail {
  const c = pick(SEAT_COPY, o.locale);
  const html = `<!doctype html><html><body style="margin:0;background:${palette.creme};font-family:Poppins,Arial,sans-serif;color:${palette.charbon}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${palette.creme};padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:${palette.blanc};border-radius:20px;padding:32px">
<tr><td style="font-size:14px;padding-bottom:8px">${brandHeader(o.organizationName, o.brand)}</td></tr>
<tr><td style="font-family:'Archivo Black',Arial Black,Arial,sans-serif;font-size:24px;line-height:1.15;letter-spacing:-0.6px;padding-bottom:12px">${escapeHtml(c.subject(o.eventTitle))}</td></tr>
<tr><td style="font-size:15px;line-height:1.6;padding-bottom:20px">${escapeHtml(c.hello(o.firstName))}<br>${escapeHtml(c.body(o.from, o.to))}</td></tr>
<tr><td><a href="${escapeHtml(o.url)}" style="display:inline-block;background:${palette.charbon};color:${palette.creme};text-decoration:none;font-weight:700;border-radius:999px;padding:14px 24px">${escapeHtml(c.cta)}</a></td></tr>
</table></td></tr></table></body></html>`;
  return { subject: c.subject(o.eventTitle), html, text: [o.organizationName, "", c.hello(o.firstName), c.body(o.from, o.to), "", `${c.cta} : ${o.url}`].join("\n") };
}
