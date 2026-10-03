import type { EmailBrand } from "./brand";
import { palette } from "@evoly/ui";

type Locale = "fr" | "en";

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
  },
  reset: {
    fr: { subject: "Réinitialisez votre mot de passe", title: "Nouveau mot de passe", intro: "Vous avez demandé à réinitialiser votre mot de passe. Choisissez-en un nouveau avec le bouton ci-dessous.", cta: "Choisir un mot de passe", outro: "Ce lien est valable une heure et ne fonctionne qu'une fois. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail." },
    en: { subject: "Reset your password", title: "New password", intro: "You asked to reset your password. Choose a new one with the button below.", cta: "Choose a password", outro: "This link is valid for one hour and works only once. If you didn't ask for this, you can ignore this email." },
  },
} as const;

function build(kind: keyof typeof COPY, url: string, locale: Locale): RenderedEmail {
  const c = COPY[kind][locale];
  return { subject: c.subject, html: layout({ ...c, url }), text: `${c.title}\n\n${c.intro}\n\n${c.cta} : ${url}\n\n${c.outro}` };
}

export const verifyEmailEmail = ({ url, locale }: { url: string; locale: Locale }) => build("verify", url, locale);
export const resetPasswordEmail = ({ url, locale }: { url: string; locale: Locale }) => build("reset", url, locale);

const ORDER_COPY = {
  fr: { subject: (t: string) => `Vos billets pour ${t}`, hello: (n: string) => `Bonjour ${n},`, intro: (o: string) => `Merci pour votre commande auprès de ${o}. Vos billets sont prêts.`, cta: "Voir mes billets", when: "Quand", where: "Où", online: "En ligne", total: "Total payé", free: "Gratuit", reference: "Référence", outro: "Présentez le QR code de chaque billet à l’entrée, sur votre téléphone ou imprimé. Ce lien est personnel : ne le partagez pas." },
  en: { subject: (t: string) => `Your tickets for ${t}`, hello: (n: string) => `Hi ${n},`, intro: (o: string) => `Thanks for your order with ${o}. Your tickets are ready.`, cta: "View my tickets", when: "When", where: "Where", online: "Online", total: "Total paid", free: "Free", reference: "Reference", outro: "Show each ticket’s QR code at the entrance, on your phone or printed. This link is personal: don’t share it." },
} as const;

export function orderConfirmationEmail(o: { brand?: EmailBrand | null; locale: Locale; organizationName: string; eventTitle: string; when: string; where: string | null; online: string | null; lines: Array<{ name: string; quantity: number }>; total: string | null; reference: string; url: string; firstName: string }): RenderedEmail {
  const c = ORDER_COPY[o.locale];
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
} as const;

/** RG-POST-02 : liens vers les commandes à venir d'une adresse. */
export function ticketsLookupEmail(o: { brand?: EmailBrand | null; locale: Locale; organizationName: string; orders: Array<{ eventTitle: string; when: string; url: string }> }): RenderedEmail {
  const c = LOOKUP_COPY[o.locale];
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
} as const;

/** E-mails au vendeur : place revendue et montant remboursé, annonce retirée, revente terminée. */
export function resaleSellerEmail(o: { brand?: EmailBrand | null; kind: "SOLD" | "CANCELLED" | "EXPIRED"; locale: Locale; organizationName: string; eventTitle: string; firstName: string; amount: string | null }): RenderedEmail {
  const c = RESALE_COPY[o.locale];
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
} as const;

/** E-mails de remboursement (section 9.14) : remboursement envoyé, demande refusée, événement annulé. */
export function refundEmail(o: { brand?: EmailBrand | null; kind: "PROCESSED" | "REJECTED" | "CANCELLED"; locale: Locale; organizationName: string; eventTitle: string; firstName: string; amount: string | null; count: number; message?: string | null }): RenderedEmail {
  const c = REFUND_COPY[o.locale];
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
    STARTED: { subject: "Bienvenue dans Evoly Pro", body: "Votre organisation est passée en Pro : commission plafonnée à 0,70 € par billet, prix dynamiques, marque personnalisée et équipe. Vous pouvez gérer votre abonnement à tout moment." },
    TRIAL_ENDING: { subject: "Votre essai Pro se termine dans 3 jours", body: "Sans action de votre part, votre abonnement démarrera automatiquement à la fin de l’essai. Vous pouvez changer de formule ou résilier depuis la page Abonnement." },
    PAYMENT_FAILED: { subject: "Le paiement de votre abonnement Pro a échoué", body: "Stripe va réessayer automatiquement. Mettez à jour votre moyen de paiement pour éviter le retour en Free, qui interviendra 7 jours après le premier échec." },
    ENDED: { subject: "Votre organisation est repassée en Free", body: "Rien n’est supprimé : vos événements, vos réglages de marque et vos paliers de prix sont conservés. La commission est de nouveau plafonnée à 1 €, la marque Evoly s’affiche, les paliers des événements publiés restent appliqués sans modification possible, et les membres autres que le propriétaire n’ont plus accès. Tout revient en repassant en Pro." },
    cta: "Gérer mon abonnement",
    hello: (n: string) => `Bonjour ${n},`,
  },
  en: {
    STARTED: { subject: "Welcome to Evoly Pro", body: "Your organisation is now on Pro: fee capped at €0.70 per ticket, dynamic pricing, custom branding and team. You can manage your subscription at any time." },
    TRIAL_ENDING: { subject: "Your Pro trial ends in 3 days", body: "If you do nothing, your subscription starts automatically when the trial ends. You can switch plans or cancel from the Billing page." },
    PAYMENT_FAILED: { subject: "Your Pro subscription payment failed", body: "Stripe will retry automatically. Update your payment method to avoid returning to Free, which happens 7 days after the first failure." },
    ENDED: { subject: "Your organisation is back on Free", body: "Nothing is deleted: your events, branding settings and price tiers are kept. The fee is capped at €1 again, the Evoly brand shows, tiers on published events keep applying but can't be edited, and members other than the owner lose access. Everything comes back when you return to Pro." },
    cta: "Manage my subscription",
    hello: (n: string) => `Hi ${n},`,
  },
} as const;

/** E-mails de l'abonnement Pro (RG-SUB-03, RG-SUB-06, RG-SUB-08). */
export function subscriptionEmail(o: { kind: "STARTED" | "TRIAL_ENDING" | "PAYMENT_FAILED" | "ENDED"; locale: Locale; organizationName: string; firstName: string; url: string }): RenderedEmail {
  const c = SUB_COPY[o.locale];
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
} as const;

/** US-MKT-01 : rappels J-7, J-1 et jour J (e-mails de service), pied de page obligatoire (RG-MKT-02). */
export function reminderEmail(o: { brand?: EmailBrand | null; locale: Locale; type: "REMINDER_J7" | "REMINDER_J1" | "REMINDER_J0"; organizationName: string; organizationAddress: string; firstName: string; eventTitle: string; when: string; where: string; tickets: number; ticketsUrl: string; unsubscribeEventUrl: string }): RenderedEmail {
  const c = REMINDER_COPY[o.locale];
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
} as const;

/** Section 9.9 : l'organisateur a changé l'acheteur de place ; lien vers les billets mis à jour. */
export function seatChangedEmail(o: { brand?: EmailBrand | null; locale: Locale; organizationName: string; eventTitle: string; firstName: string; from: string; to: string; url: string }): RenderedEmail {
  const c = SEAT_COPY[o.locale];
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
