import "server-only";
import {
  commissionVat,
  statementNumber,
  utcToZonedLocal,
  vatIncluded,
  type VatMention,
} from "@evoly/core";
import { Prisma } from "@evoly/db";
import { formatDate, formatMoney, type Locale, toLocale } from "@evoly/i18n";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { safeError } from "@/lib/redact";
import { clean, MENTIONS } from "./finances";
import { notifyOwner } from "./subscriptionMail";

/** Client figé sur la facture au jour de l'émission. */
export interface InvoiceCustomer {
  name: string;
  address: string | null;
  country: string;
  vatNumber: string | null;
}

/**
 * Facture d'un paiement Pro reçu (docs/MOLLIE.md, lot 6) : émise une seule fois par paiement, avec un numéro de la même
 * série sans trou que les relevés de commissions, la TVA de la commission (RG-FEE-30) et le client du jour. Envoyée au
 * propriétaire, avec la date et le montant du prochain prélèvement s'il y en a un (préavis du prélèvement).
 */
export async function issueProInvoice(
  paymentId: string,
  next: { date: Date; amountMinor: number; method: string | null } | null,
  now = new Date(),
) {
  const existing = await db.proInvoice.findUnique({ where: { paymentId } });
  if (existing) return existing;
  const p = await db.subscriptionPayment.findUniqueOrThrow({
    where: { id: paymentId },
  });
  if (
    p.status !== "PAID" ||
    p.amountMinor <= 0 ||
    !p.interval ||
    !p.periodStart ||
    !p.periodEnd
  )
    return null;
  const org = await db.organization.findUniqueOrThrow({
    where: { id: p.organizationId },
  });
  const vat = commissionVat(org);
  const customer: InvoiceCustomer = {
    name: org.legalName ?? org.name,
    address:
      [
        org.addressLine1,
        org.addressLine2,
        [org.postalCode, org.city].filter(Boolean).join(" "),
      ]
        .filter(Boolean)
        .join(", ") || null,
    country: org.country,
    vatNumber: org.vatNumber?.trim() || null,
  };
  try {
    const invoice = await db.$transaction(async (tx) => {
      const seq = await tx.$queryRaw<
        Array<{ n: bigint }>
      >`SELECT nextval('commission_statement_number_seq') AS n`;
      return tx.proInvoice.create({
        data: {
          organizationId: org.id,
          paymentId,
          // année de l'émission en Belgique, siège d'Evoly
          number: statementNumber(
            Number(utcToZonedLocal(now, "Europe/Brussels").slice(0, 4)),
            Number(seq[0]!.n),
          ),
          issuedAt: now,
          interval: p.interval!,
          periodStart: p.periodStart!,
          periodEnd: p.periodEnd!,
          currency: p.currency,
          totalMinor: p.amountMinor,
          vatRateBps: vat.rateBps || null,
          vatMinor: vatIncluded(p.amountMinor, vat.rateBps),
          vatMention: vat.mention,
          method: p.method,
          customer: customer as unknown as Prisma.InputJsonValue,
        },
      });
    });
    await mailProInvoice(invoice.id, next).catch((err) =>
      console.error("facture Pro non envoyée", invoice.id, safeError(err)),
    );
    return invoice;
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    )
      return db.proInvoice.findUnique({ where: { paymentId } });
    throw err;
  }
}

async function mailProInvoice(
  invoiceId: string,
  next: { date: Date; amountMinor: number; method: string | null } | null,
) {
  const inv = await db.proInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
  });
  const { bytes, number } = await proInvoicePdf(inv.id);
  await notifyOwner(inv.organizationId, "INVOICE", {
    vars: ({ locale, timezone }) => ({
      number,
      amount: formatMoney(inv.totalMinor, inv.currency, locale),
      ...(next
        ? {
            nextDate: formatDate(next.date, timezone, locale),
            nextAmount: formatMoney(next.amountMinor, inv.currency, locale),
            method: next.method,
          }
        : {}),
    }),
    attachments: [
      {
        filename: `${number}.pdf`,
        content: Buffer.from(bytes),
        contentType: "application/pdf",
      },
    ],
  });
}

/** Libellés de la facture Pro, dans la langue de l'organisation. */
const LABELS: Record<
  Locale,
  {
    title: string;
    number: string;
    date: string;
    client: string;
    issuer: string;
    vat: string;
    noVat: string;
    description: string;
    amount: string;
    line: Record<"MONTH" | "YEAR", string>;
    period: string;
    total: string;
    ofVat: string;
    paid: (date: string, method: string | null) => string;
    methods: Record<string, string>;
  }
> = {
  fr: {
    title: "Facture",
    number: "Numéro",
    date: "Date d’émission",
    client: "Client",
    issuer: "Émetteur",
    vat: "TVA",
    noVat: "Numéro de TVA : à compléter",
    description: "Description",
    amount: "Montant",
    line: {
      MONTH: "Abonnement Evoly Pro, mensuel",
      YEAR: "Abonnement Evoly Pro, annuel",
    },
    period: "Période",
    total: "Total TTC",
    ofVat: "dont TVA",
    paid: (d, m) =>
      `Facture acquittée : payée le ${d}${m ? ` (${m})` : ""} via Mollie. Rien à payer.`,
    methods: {
      creditcard: "carte bancaire",
      directdebit: "prélèvement SEPA",
    },
  },
  en: {
    title: "Invoice",
    number: "Number",
    date: "Issue date",
    client: "Customer",
    issuer: "Issuer",
    vat: "VAT",
    noVat: "VAT number: to be completed",
    description: "Description",
    amount: "Amount",
    line: {
      MONTH: "Evoly Pro subscription, monthly",
      YEAR: "Evoly Pro subscription, yearly",
    },
    period: "Period",
    total: "Total incl. VAT",
    ofVat: "of which VAT",
    paid: (d, m) =>
      `Invoice settled: paid on ${d}${m ? ` (${m})` : ""} via Mollie. Nothing to pay.`,
    methods: { creditcard: "card", directdebit: "SEPA Direct Debit" },
  },
  es: {
    title: "Factura",
    number: "Número",
    date: "Fecha de emisión",
    client: "Cliente",
    issuer: "Emisor",
    vat: "IVA",
    noVat: "Número de IVA: pendiente de completar",
    description: "Descripción",
    amount: "Importe",
    line: {
      MONTH: "Suscripción Evoly Pro, mensual",
      YEAR: "Suscripción Evoly Pro, anual",
    },
    period: "Periodo",
    total: "Total con IVA",
    ofVat: "de los cuales IVA",
    paid: (d, m) =>
      `Factura pagada el ${d}${m ? ` (${m})` : ""} a través de Mollie. No hay nada que pagar.`,
    methods: { creditcard: "tarjeta", directdebit: "adeudo directo SEPA" },
  },
  de: {
    title: "Rechnung",
    number: "Nummer",
    date: "Ausstellungsdatum",
    client: "Kunde",
    issuer: "Aussteller",
    vat: "USt.",
    noVat: "USt-IdNr.: noch zu ergänzen",
    description: "Beschreibung",
    amount: "Betrag",
    line: {
      MONTH: "Abo Evoly Pro, monatlich",
      YEAR: "Abo Evoly Pro, jährlich",
    },
    period: "Zeitraum",
    total: "Gesamt inkl. USt.",
    ofVat: "davon USt.",
    paid: (d, m) =>
      `Rechnung beglichen: bezahlt am ${d}${m ? ` (${m})` : ""} über Mollie. Nichts zu zahlen.`,
    methods: { creditcard: "Karte", directdebit: "SEPA-Lastschrift" },
  },
  it: {
    title: "Fattura",
    number: "Numero",
    date: "Data di emissione",
    client: "Cliente",
    issuer: "Emittente",
    vat: "IVA",
    noVat: "Partita IVA: da completare",
    description: "Descrizione",
    amount: "Importo",
    line: {
      MONTH: "Abbonamento Evoly Pro, mensile",
      YEAR: "Abbonamento Evoly Pro, annuale",
    },
    period: "Periodo",
    total: "Totale IVA inclusa",
    ofVat: "di cui IVA",
    paid: (d, m) =>
      `Fattura saldata: pagata il ${d}${m ? ` (${m})` : ""} tramite Mollie. Nulla da pagare.`,
    methods: { creditcard: "carta", directdebit: "addebito diretto SEPA" },
  },
  pt: {
    title: "Fatura",
    number: "Número",
    date: "Data de emissão",
    client: "Cliente",
    issuer: "Emitente",
    vat: "IVA",
    noVat: "Número de IVA: a completar",
    description: "Descrição",
    amount: "Montante",
    line: {
      MONTH: "Subscrição Evoly Pro, mensal",
      YEAR: "Subscrição Evoly Pro, anual",
    },
    period: "Período",
    total: "Total com IVA",
    ofVat: "dos quais IVA",
    paid: (d, m) =>
      `Fatura liquidada: paga a ${d}${m ? ` (${m})` : ""} através da Mollie. Nada a pagar.`,
    methods: { creditcard: "cartão", directdebit: "débito direto SEPA" },
  },
  nl: {
    title: "Factuur",
    number: "Nummer",
    date: "Factuurdatum",
    client: "Klant",
    issuer: "Uitgever",
    vat: "Btw",
    noVat: "Btw-nummer: nog in te vullen",
    description: "Omschrijving",
    amount: "Bedrag",
    line: {
      MONTH: "Abonnement Evoly Pro, maandelijks",
      YEAR: "Abonnement Evoly Pro, jaarlijks",
    },
    period: "Periode",
    total: "Totaal incl. btw",
    ofVat: "waarvan btw",
    paid: (d, m) =>
      `Factuur voldaan: betaald op ${d}${m ? ` (${m})` : ""} via Mollie. Niets te betalen.`,
    methods: { creditcard: "kaart", directdebit: "SEPA-incasso" },
  },
};

/** Moyen de paiement imprimé sur la facture : les noms de marque tels quels, les autres traduits. */
const BRANDS: Record<string, string> = {
  bancontact: "Bancontact",
  applepay: "Apple Pay",
  googlepay: "Google Pay",
  paypal: "PayPal",
  ideal: "iDEAL",
  belfius: "Belfius",
  kbc: "KBC/CBC",
  eps: "EPS",
};

/** PDF de la facture Pro : émetteur, client figé, ligne d'abonnement et sa période, TVA et mention, paiement reçu. */
export async function proInvoicePdf(
  invoiceId: string,
): Promise<{ bytes: Uint8Array; number: string }> {
  const inv = await db.proInvoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: {
      organization: { select: { locale: true, timezone: true } },
      payment: { select: { paidAt: true } },
    },
  });
  const locale = toLocale(inv.organization.locale);
  const tz = inv.organization.timezone;
  const L = LABELS[locale];
  const c = inv.customer as unknown as InvoiceCustomer;
  const money = (v: number) => clean(formatMoney(v, inv.currency, locale));
  const day = (d: Date) => clean(formatDate(d, tz, locale));
  const pdf = await PDFDocument.create();
  pdf.setTitle(clean(`${L.title} ${inv.number}`));
  pdf.setCreator("Evoly");
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0x22 / 255, 0x22 / 255, 0x22 / 255);
  const grey = rgb(0.4, 0.4, 0.4);
  const cream = rgb(1, 0.965, 0.941);
  const text = (
    s: string,
    x: number,
    y: number,
    size = 10,
    font = regular,
    color = ink,
  ) => page.drawText(clean(s), { x, y, size, font, color });
  page.drawRectangle({
    x: 0,
    y: 761.89,
    width: 595.28,
    height: 80,
    color: ink,
  });
  text("evoly", 48, 790, 24, bold, cream);
  text(L.title, 380, 792, 13, bold, cream);
  let y = 720;
  text(L.issuer, 48, y, 9, bold, grey);
  text(L.client, 320, y, 9, bold, grey);
  y -= 16;
  const e = env();
  const issuer = [
    e.EVOLY_LEGAL_NAME,
    e.EVOLY_LEGAL_ADDRESS,
    e.EVOLY_VAT_NUMBER ? `${L.vat} ${e.EVOLY_VAT_NUMBER}` : L.noVat,
  ];
  const client = [
    c.name,
    [c.address, c.country].filter(Boolean).join(", "),
    c.vatNumber ? `${L.vat} ${c.vatNumber}` : "",
  ].filter(Boolean);
  for (let i = 0; i < Math.max(issuer.length, client.length); i++) {
    if (issuer[i]) text(issuer[i]!, 48, y, 10);
    if (client[i]) text(client[i]!, 320, y, 10);
    y -= 14;
  }
  y -= 12;
  for (const [k, v] of [
    [L.number, inv.number],
    [L.date, day(inv.issuedAt)],
  ] as const) {
    text(k, 48, y, 10, bold);
    text(v, 170, y, 10);
    y -= 15;
  }
  y -= 18;
  page.drawRectangle({ x: 48, y: y - 6, width: 499, height: 22, color: cream });
  text(L.description, 56, y, 10, bold);
  text(L.amount, 470, y, 10, bold);
  y -= 22;
  text(L.line[inv.interval], 56, y, 10);
  text(money(inv.totalMinor), 470, y, 10);
  y -= 14;
  text(
    `${L.period}${locale === "fr" ? " : " : ": "}${day(inv.periodStart)} - ${day(new Date(inv.periodEnd.getTime() - 1))}`,
    56,
    y,
    9,
    regular,
    grey,
  );
  y -= 24;
  page.drawLine({
    start: { x: 48, y: y + 6 },
    end: { x: 547, y: y + 6 },
    color: grey,
    thickness: 0.5,
  });
  text(L.total, 380, y - 10, 11, bold);
  text(money(inv.totalMinor), 470, y - 10, 11, bold);
  if (inv.vatMinor > 0) {
    text(`${L.ofVat} (${(inv.vatRateBps ?? 0) / 100} %)`, 380, y - 28, 10);
    text(money(inv.vatMinor), 470, y - 28, 10);
  }
  const mention =
    MENTIONS[locale][(inv.vatMention as VatMention) ?? "BE_VAT"]?.(
      `${(inv.vatRateBps ?? 0) / 100} %`,
    ) ?? "";
  text(mention, 48, y - 56, 9, regular, grey);
  const method = inv.method
    ? (L.methods[inv.method] ?? BRANDS[inv.method] ?? inv.method)
    : null;
  const paidLine = L.paid(day(inv.payment.paidAt ?? inv.issuedAt), method);
  let line = "";
  let fy = 80;
  for (const w of paidLine.split(" ")) {
    const nextLine = line ? `${line} ${w}` : w;
    if (regular.widthOfTextAtSize(clean(nextLine), 9) > 499) {
      text(line, 48, fy, 9, regular, grey);
      fy -= 12;
      line = w;
    } else line = nextLine;
  }
  if (line) text(line, 48, fy, 9, regular, grey);
  return { bytes: await pdf.save(), number: inv.number };
}
