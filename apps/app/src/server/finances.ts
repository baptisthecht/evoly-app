import "server-only";
import { commissionVat, CoreError, financeByEvent, financeTotals, statementNumber, utcToZonedLocal, vatIncluded, zonedLocalToUtc, type FinanceOrder, type VatMention } from "@evoly/core";
import { formatDate, formatMoney, type Locale, toLocale } from "@evoly/i18n";
import { Prisma } from "@evoly/db";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { stripe } from "@/lib/stripe";
import type { OrgContext } from "./context";
import { sendEmail } from "./email/send";
import { notify } from "./notifications";

export type Period = "THIS_MONTH" | "LAST_MONTH" | "LAST_30_DAYS" | "THIS_YEAR" | "ALL";
const COUNTED = ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] as const;

const monthStart = (year: number, month: number, tz: string) => zonedLocalToUtc(`${year}-${String(month).padStart(2, "0")}-01T00:00`, tz);
const nextMonth = (year: number, month: number): [number, number] => (month === 12 ? [year + 1, 1] : [year, month + 1]);

/** Bornes d'une période, calculées dans le fuseau de l'organisation. */
export function periodRange(period: Period, tz: string, now = new Date()): { from: Date | null; to: Date | null } {
  const local = utcToZonedLocal(now, tz);
  const y = Number(local.slice(0, 4));
  const m = Number(local.slice(5, 7));
  switch (period) {
    case "THIS_MONTH":
      return { from: monthStart(y, m, tz), to: null };
    case "LAST_MONTH": {
      const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
      return { from: monthStart(py, pm, tz), to: monthStart(y, m, tz) };
    }
    case "LAST_30_DAYS":
      return { from: new Date(now.getTime() - 30 * 86_400_000), to: null };
    case "THIS_YEAR":
      return { from: zonedLocalToUtc(`${y}-01-01T00:00`, tz), to: null };
    case "ALL":
      return { from: null, to: null };
  }
}

async function periodOrders(organizationId: string, range: { from: Date | null; to: Date | null }, eventId?: string, currency?: string) {
  return db.order.findMany({
    where: { organizationId, status: { in: [...COUNTED] }, paidAt: { not: null, ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: range.to } : {}) }, ...(eventId ? { eventId } : {}), ...(currency ? { currency } : {}) },
    select: { id: true, reference: true, eventId: true, status: true, source: true, currency: true, totalMinor: true, refundedMinor: true, applicationFeeMinor: true, paymentFeeMinor: true, netMinor: true, paidAt: true, buyerFirstName: true, buyerLastName: true, buyerEmail: true, paymentMethodType: true, _count: { select: { tickets: true } } },
    orderBy: { paidAt: "asc" },
  });
}
type PeriodOrder = Awaited<ReturnType<typeof periodOrders>>[number];
const toFinance = (o: PeriodOrder): FinanceOrder => ({ eventId: o.eventId, status: o.status, totalMinor: o.totalMinor, refundedMinor: o.refundedMinor, applicationFeeMinor: o.applicationFeeMinor, paymentFeeMinor: o.paymentFeeMinor, tickets: o._count.tickets });

/** US-FIN-01 : totaux et tableau par événement pour une période. */
export async function financeOverview(ctx: OrgContext, opts: { period: Period; eventId?: string }) {
  const range = periodRange(opts.period, ctx.organization.timezone);
  const orders = await periodOrders(ctx.organization.id, range, opts.eventId, ctx.organization.currency);
  const events = await db.event.findMany({ where: { organizationId: ctx.organization.id, id: { in: [...new Set(orders.map((o) => o.eventId))] } }, select: { id: true, title: true, startsAt: true } });
  const titles = new Map(events.map((e) => [e.id, e]));
  const grouped = financeByEvent(orders.map(toFinance));
  return {
    range,
    currency: ctx.organization.currency,
    totals: financeTotals(orders.map(toFinance)),
    byEvent: [...grouped].map(([eventId, totals]) => ({ eventId, title: titles.get(eventId)?.title ?? "—", startsAt: titles.get(eventId)?.startsAt ?? null, ...totals })).sort((a, b) => b.grossMinor - a.grossMinor),
  };
}

/** US-FIN-02, RG-FIN-02 : état du compte, soldes et virements lus chez Stripe (jamais déclenchés par Evoly, RG-FIN-01). */
export async function stripeOverview(ctx: OrgContext) {
  const account = await db.stripeAccount.findUnique({ where: { organizationId: ctx.organization.id } });
  if (!account) return { connected: false as const };
  const s = stripe();
  let balance: { available: Array<{ amount: number; currency: string }>; pending: Array<{ amount: number; currency: string }> } | null = null;
  let payouts: Array<{ id: string; amount: number; currency: string; status: string; arrivalDate: Date }> | null = null;
  let unavailable = !s;
  if (s) {
    try {
      const opts = { stripeAccount: account.stripeAccountId };
      const [b, p] = await Promise.all([s.balance.retrieve({}, opts), s.payouts.list({ limit: 10 }, opts)]);
      const map = (list: Array<{ amount: number; currency: string }>) => list.map((x) => ({ amount: x.amount, currency: x.currency.toUpperCase() }));
      balance = { available: map(b.available), pending: map(b.pending) };
      payouts = p.data.map((x) => ({ id: x.id, amount: x.amount, currency: x.currency.toUpperCase(), status: x.status, arrivalDate: new Date(x.arrival_date * 1000) }));
    } catch {
      unavailable = true;
    }
  }
  const disputes = await db.dispute.findMany({ where: { accountId: account.stripeAccountId, status: { in: ["NEEDS_RESPONSE", "WARNING_NEEDS_RESPONSE", "UNDER_REVIEW", "WARNING_UNDER_REVIEW"] } }, include: { order: { select: { id: true, reference: true } } }, orderBy: { evidenceDueBy: "asc" } });
  return { connected: true as const, status: account.status, chargesEnabled: account.chargesEnabled, payoutsEnabled: account.payoutsEnabled, requirementsDue: Array.isArray(account.requirementsDue) ? account.requirementsDue.length : 0, balance, payouts, unavailable, disputes };
}

const DISPUTE_STATUS: Record<string, "WARNING_NEEDS_RESPONSE" | "WARNING_UNDER_REVIEW" | "WARNING_CLOSED" | "NEEDS_RESPONSE" | "UNDER_REVIEW" | "WON" | "LOST"> = {
  warning_needs_response: "WARNING_NEEDS_RESPONSE", warning_under_review: "WARNING_UNDER_REVIEW", warning_closed: "WARNING_CLOSED", needs_response: "NEEDS_RESPONSE", under_review: "UNDER_REVIEW", won: "WON", lost: "LOST", prevented: "WON",
};

/** RG-FIN-03 : copie locale d'un litige reçu par webhook, rattaché à sa commande. */
export async function upsertDispute(d: { id: string; charge: string; account: string; amount: number; currency: string; reason: string; status: string; dueBy: number | null }) {
  const order = await db.order.findFirst({ where: { stripeChargeId: d.charge }, select: { id: true } });
  const data = { stripeChargeId: d.charge, accountId: d.account, amountMinor: d.amount, currency: d.currency.toUpperCase(), reason: d.reason, status: DISPUTE_STATUS[d.status] ?? "NEEDS_RESPONSE", evidenceDueBy: d.dueBy ? new Date(d.dueBy * 1000) : null, orderId: order?.id ?? null };
  const existed = await db.dispute.findUnique({ where: { stripeDisputeId: d.id }, select: { id: true } });
  await db.dispute.upsert({ where: { stripeDisputeId: d.id }, create: { stripeDisputeId: d.id, ...data }, update: data });
  // RG-FIN-03 et section 9.20 : litige ouvert signalé (et envoyé par e-mail, RG-NTF-02)
  const org = existed ? null : await db.stripeAccount.findUnique({ where: { stripeAccountId: d.account }, select: { organizationId: true } });
  if (org) await notify(org.organizationId, "DISPUTE_OPENED", { title: "Litige ouvert", body: `Un acheteur conteste un paiement de ${(d.amount / 100).toFixed(2).replace(".", ",")} ${d.currency.toUpperCase()}. Répondez dans Stripe avant l'échéance.`, link: "/finances" });
}

/** Mois ayant des commissions, avec leur relevé s'il est émis (le mois en cours reste ouvert). */
export async function statementMonths(ctx: OrgContext, now = new Date()) {
  const tz = ctx.organization.timezone;
  const orders = await db.order.findMany({ where: { organizationId: ctx.organization.id, status: { in: [...COUNTED] }, paidAt: { not: null }, applicationFeeMinor: { gt: 0 } }, select: { paidAt: true, applicationFeeMinor: true, currency: true } });
  const months = new Map<string, { period: string; currency: string; feesMinor: number }>();
  for (const o of orders) {
    const period = utcToZonedLocal(o.paidAt!, tz).slice(0, 7);
    const key = `${period}:${o.currency}`;
    const row = months.get(key) ?? { period, currency: o.currency, feesMinor: 0 };
    row.feesMinor += o.applicationFeeMinor;
    months.set(key, row);
  }
  const statements = await db.commissionStatement.findMany({ where: { organizationId: ctx.organization.id } });
  const current = utcToZonedLocal(now, tz).slice(0, 7);
  return [...months.values()]
    .sort((a, b) => b.period.localeCompare(a.period))
    .map((m) => ({ ...m, open: m.period >= current, statement: statements.find((s) => utcToZonedLocal(s.periodStart, tz).slice(0, 7) === m.period && s.currency === m.currency) ?? null }));
}

const MENTIONS: Record<Locale, Record<VatMention, (rate: string) => string>> = {
  fr: { BE_VAT: (r) => `TVA belge ${r} comprise`, REVERSE_CHARGE: () => "Autoliquidation : TVA due par le preneur (article 196 de la directive 2006/112/CE)", OSS: (r) => `TVA ${r} du pays du client comprise, déclarée via le guichet unique (OSS)`, OUTSIDE_EU: () => "Hors champ de la TVA de l’Union européenne" },
  en: { BE_VAT: (r) => `Belgian VAT ${r} included`, REVERSE_CHARGE: () => "Reverse charge: VAT payable by the customer (article 196 of Directive 2006/112/EC)", OSS: (r) => `Customer country VAT ${r} included, declared via the One-Stop Shop (OSS)`, OUTSIDE_EU: () => "Outside the scope of EU VAT" },
  es: { BE_VAT: (r) => `IVA belga ${r} incluido`, REVERSE_CHARGE: () => "Inversión del sujeto pasivo: IVA a cargo del cliente (artículo 196 de la Directiva 2006/112/CE)", OSS: (r) => `IVA ${r} del país del cliente incluido, declarado a través de la ventanilla única (OSS)`, OUTSIDE_EU: () => "Fuera del ámbito del IVA de la Unión Europea" },
  de: { BE_VAT: (r) => `Belgische USt. ${r} enthalten`, REVERSE_CHARGE: () => "Steuerschuldnerschaft des Leistungsempfängers (Artikel 196 der Richtlinie 2006/112/EG)", OSS: (r) => `USt. ${r} des Kundenlandes enthalten, erklärt über den One-Stop-Shop (OSS)`, OUTSIDE_EU: () => "Nicht im Anwendungsbereich der Mehrwertsteuer der Europäischen Union" },
  it: { BE_VAT: (r) => `IVA belga ${r} inclusa`, REVERSE_CHARGE: () => "Inversione contabile: IVA dovuta dal committente (articolo 196 della direttiva 2006/112/CE)", OSS: (r) => `IVA ${r} del paese del cliente inclusa, dichiarata tramite lo sportello unico (OSS)`, OUTSIDE_EU: () => "Fuori dal campo di applicazione dell’IVA dell’Unione europea" },
  pt: { BE_VAT: (r) => `IVA belga ${r} incluído`, REVERSE_CHARGE: () => "Autoliquidação: IVA devido pelo adquirente (artigo 196.º da Diretiva 2006/112/CE)", OSS: (r) => `IVA ${r} do país do cliente incluído, declarado através do balcão único (OSS)`, OUTSIDE_EU: () => "Fora do âmbito do IVA da União Europeia" },
  nl: { BE_VAT: (r) => `Belgische btw ${r} inbegrepen`, REVERSE_CHARGE: () => "Btw verlegd: btw verschuldigd door de afnemer (artikel 196 van Richtlijn 2006/112/EG)", OSS: (r) => `Btw ${r} van het land van de klant inbegrepen, aangegeven via het éénloketsysteem (OSS)`, OUTSIDE_EU: () => "Buiten het toepassingsgebied van de btw van de Europese Unie" },
};

/** Libellés du relevé de commissions, dans la langue de l'organisation. */
const STATEMENT_LABELS: Record<Locale, { title: string; number: string; date: string; period: string; client: string; issuer: string; vat: string; event: string; tickets: string; fees: string; total: string; ofVat: string; noVat: string; footer: string }> = {
  fr: { title: "Relevé de commissions", number: "Numéro", date: "Date d’émission", period: "Période", client: "Client", issuer: "Émetteur", vat: "TVA", event: "Événement", tickets: "Billets", fees: "Commissions", total: "Total TTC", ofVat: "dont TVA", noVat: "Numéro de TVA : à compléter", footer: "Commissions Evoly prélevées sur les ventes de billets, selon les conditions de l’offre en vigueur à la date de chaque vente. Montants débités par Stripe lors de chaque vente : rien à payer." },
  en: { title: "Commission statement", number: "Number", date: "Issue date", period: "Period", client: "Customer", issuer: "Issuer", vat: "VAT", event: "Event", tickets: "Tickets", fees: "Fees", total: "Total incl. VAT", ofVat: "of which VAT", noVat: "VAT number: to be completed", footer: "Evoly fees taken on ticket sales, under the plan terms in force on the date of each sale. Amounts collected by Stripe on each sale: nothing to pay." },
  es: { title: "Extracto de comisiones", number: "Número", date: "Fecha de emisión", period: "Periodo", client: "Cliente", issuer: "Emisor", vat: "IVA", event: "Evento", tickets: "Entradas", fees: "Comisiones", total: "Total con IVA", ofVat: "de los cuales IVA", noVat: "Número de IVA: pendiente de completar", footer: "Comisiones de Evoly cobradas sobre la venta de entradas, según las condiciones del plan vigentes en la fecha de cada venta. Importes cobrados por Stripe en cada venta: no hay nada que pagar." },
  de: { title: "Gebührenabrechnung", number: "Nummer", date: "Ausstellungsdatum", period: "Zeitraum", client: "Kunde", issuer: "Aussteller", vat: "USt.", event: "Veranstaltung", tickets: "Tickets", fees: "Gebühren", total: "Gesamt inkl. USt.", ofVat: "davon USt.", noVat: "USt-IdNr.: noch zu ergänzen", footer: "Evoly-Gebühren, die beim Ticketverkauf einbehalten werden, gemäß den am Tag jedes Verkaufs geltenden Tarifbedingungen. Von Stripe bei jedem Verkauf eingezogene Beträge: nichts zu zahlen." },
  it: { title: "Rendiconto delle commissioni", number: "Numero", date: "Data di emissione", period: "Periodo", client: "Cliente", issuer: "Emittente", vat: "IVA", event: "Evento", tickets: "Biglietti", fees: "Commissioni", total: "Totale IVA inclusa", ofVat: "di cui IVA", noVat: "Partita IVA: da completare", footer: "Commissioni Evoly trattenute sulle vendite di biglietti, secondo le condizioni del piano in vigore alla data di ogni vendita. Importi riscossi da Stripe a ogni vendita: nulla da pagare." },
  pt: { title: "Extrato de comissões", number: "Número", date: "Data de emissão", period: "Período", client: "Cliente", issuer: "Emitente", vat: "IVA", event: "Evento", tickets: "Bilhetes", fees: "Comissões", total: "Total com IVA", ofVat: "dos quais IVA", noVat: "Número de IVA: a completar", footer: "Comissões Evoly cobradas sobre as vendas de bilhetes, segundo as condições do plano em vigor na data de cada venda. Montantes cobrados pela Stripe em cada venda: nada a pagar." },
  nl: { title: "Commissie-overzicht", number: "Nummer", date: "Uitgiftedatum", period: "Periode", client: "Klant", issuer: "Uitgever", vat: "Btw", event: "Evenement", tickets: "Tickets", fees: "Commissies", total: "Totaal incl. btw", ofVat: "waarvan btw", noVat: "Btw-nummer: nog in te vullen", footer: "Commissies van Evoly ingehouden op de ticketverkoop, volgens de abonnementsvoorwaarden die gelden op de datum van elke verkoop. Bedragen die Stripe bij elke verkoop int: niets te betalen." },
};

/**
 * RG-FEE-30 : relevé mensuel des commissions, par organisation et par devise, émis une seule fois,
 * avec un numéro tiré d'une séquence sans trou. Il vaut facture. RG-FEE-31 : PDF envoyé au propriétaire.
 */
export async function issueStatement(organizationId: string, period: string, currency: string, now = new Date()) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new CoreError("NOT_FOUND");
  const org = await db.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const [year, month] = period.split("-").map(Number) as [number, number];
  const periodStart = monthStart(year, month, org.timezone);
  const periodEnd = monthStart(...nextMonth(year, month), org.timezone);
  if (periodEnd > now) throw new CoreError("STATEMENT_PERIOD_OPEN");
  const existing = await db.commissionStatement.findUnique({ where: { organizationId_periodStart_currency: { organizationId, periodStart, currency } } });
  if (existing) return existing;
  const orders = await periodOrders(organizationId, { from: periodStart, to: periodEnd }, undefined, currency);
  const feesMinor = orders.reduce((n, o) => n + o.applicationFeeMinor, 0);
  if (feesMinor === 0) throw new CoreError("STATEMENT_EMPTY");
  const vat = commissionVat(org);
  try {
    const statement = await db.$transaction(async (tx) => {
      const seq = await tx.$queryRaw<Array<{ n: bigint }>>`SELECT nextval('commission_statement_number_seq') AS n`;
      const n = seq[0]!.n;
      return tx.commissionStatement.create({
        data: { organizationId, number: statementNumber(year, Number(n)), periodStart, periodEnd, currency, ticketsCount: orders.reduce((k, o) => k + o._count.tickets, 0), feesMinor, feesRefundedMinor: 0, vatRateBps: vat.rateBps || null, vatMinor: vatIncluded(feesMinor, vat.rateBps), totalMinor: feesMinor, vatMention: vat.mention, status: "ISSUED", issuedAt: now },
      });
    });
    await mailStatement(statement.id).catch((err) => console.error("relevé non envoyé", statement.id, err));
    return statement;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return db.commissionStatement.findUniqueOrThrow({ where: { organizationId_periodStart_currency: { organizationId, periodStart, currency } } });
    throw err;
  }
}

const clean = (s: string) => s.replace(/[\u202f\u00a0\u2009]/g, " ").replace(/[^\x20-\x7e\u00a0-\u00ff\u2018\u2019\u201c\u201d\u2013\u2014\u2026\u20ac\u0152\u0153]/g, "");

/** PDF du relevé : émetteur, client, période, détail par événement, TVA et mention appliquée. */
export async function statementPdf(statementId: string): Promise<{ bytes: Uint8Array; number: string }> {
  const st = await db.commissionStatement.findUniqueOrThrow({ where: { id: statementId }, include: { organization: true } });
  const org = st.organization;
  const locale = toLocale(org.locale); // relevés dans la langue de l'organisation
  const orders = await periodOrders(org.id, { from: st.periodStart, to: st.periodEnd }, undefined, st.currency);
  const events = await db.event.findMany({ where: { id: { in: [...new Set(orders.map((o) => o.eventId))] } }, select: { id: true, title: true } });
  const rows = events.map((e) => ({ title: e.title, tickets: orders.filter((o) => o.eventId === e.id).reduce((n, o) => n + o._count.tickets, 0), fees: orders.filter((o) => o.eventId === e.id).reduce((n, o) => n + o.applicationFeeMinor, 0) })).filter((r) => r.fees > 0);
  const L = STATEMENT_LABELS[locale];
  const money = (v: number) => clean(formatMoney(v, st.currency, locale));
  const pdf = await PDFDocument.create();
  pdf.setTitle(clean(`${L.title} ${st.number}`));
  pdf.setCreator("Evoly");
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0x22 / 255, 0x22 / 255, 0x22 / 255);
  const grey = rgb(0.4, 0.4, 0.4);
  const text = (s: string, x: number, y: number, size = 10, font = regular, color = ink) => page.drawText(clean(s), { x, y, size, font, color });
  page.drawRectangle({ x: 0, y: 761.89, width: 595.28, height: 80, color: ink });
  text("evoly", 48, 790, 24, bold, rgb(1, 0.965, 0.941));
  text(L.title, 380, 792, 13, bold, rgb(1, 0.965, 0.941));
  let y = 720;
  text(L.issuer, 48, y, 9, bold, grey);
  text(L.client, 320, y, 9, bold, grey);
  y -= 16;
  const issuer = [env().EVOLY_LEGAL_NAME, env().EVOLY_LEGAL_ADDRESS, env().EVOLY_VAT_NUMBER ? `${L.vat} ${env().EVOLY_VAT_NUMBER}` : L.noVat];
  const client = [org.legalName ?? org.name, [org.addressLine1, [org.postalCode, org.city].filter(Boolean).join(" "), org.country].filter(Boolean).join(", "), org.vatNumber ? `${L.vat} ${org.vatNumber}` : ""].filter(Boolean);
  for (let i = 0; i < Math.max(issuer.length, client.length); i++) {
    if (issuer[i]) text(issuer[i]!, 48, y, 10);
    if (client[i]) text(client[i]!, 320, y, 10);
    y -= 14;
  }
  y -= 12;
  for (const [k, v] of [[L.number, st.number], [L.date, formatDate(st.issuedAt ?? st.createdAt, org.timezone, locale)], [L.period, `${formatDate(st.periodStart, org.timezone, locale)} - ${formatDate(new Date(st.periodEnd.getTime() - 1), org.timezone, locale)}`]] as const) {
    text(k, 48, y, 10, bold);
    text(v, 170, y, 10);
    y -= 15;
  }
  y -= 18;
  page.drawRectangle({ x: 48, y: y - 6, width: 499, height: 22, color: rgb(1, 0.965, 0.941) });
  text(L.event, 56, y, 10, bold);
  text(L.tickets, 380, y, 10, bold);
  text(L.fees, 470, y, 10, bold);
  y -= 22;
  for (const r of rows) {
    text(r.title.length > 60 ? `${r.title.slice(0, 57)}...` : r.title, 56, y, 10);
    text(String(r.tickets), 380, y, 10);
    text(money(r.fees), 470, y, 10);
    y -= 16;
    if (y < 180) break;
  }
  y -= 10;
  page.drawLine({ start: { x: 48, y: y + 6 }, end: { x: 547, y: y + 6 }, color: grey, thickness: 0.5 });
  text(L.total, 380, y - 10, 11, bold);
  text(money(st.totalMinor), 470, y - 10, 11, bold);
  if (st.vatMinor > 0) {
    text(`${L.ofVat} (${(st.vatRateBps ?? 0) / 100} %)`, 380, y - 28, 10);
    text(money(st.vatMinor), 470, y - 28, 10);
  }
  const mention = MENTIONS[locale][(st.vatMention as VatMention) ?? "BE_VAT"]?.(`${(st.vatRateBps ?? 0) / 100} %`) ?? "";
  text(mention, 48, y - 56, 9, regular, grey);
  const words = L.footer.split(" ");
  let line = "";
  let fy = 80;
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (regular.widthOfTextAtSize(clean(next), 9) > 499) {
      text(line, 48, fy, 9, regular, grey);
      fy -= 12;
      line = w;
    } else line = next;
  }
  if (line) text(line, 48, fy, 9, regular, grey);
  return { bytes: await pdf.save(), number: st.number };
}

async function mailStatement(statementId: string) {
  const st = await db.commissionStatement.findUniqueOrThrow({ where: { id: statementId }, include: { organization: { include: { members: { where: { role: { systemKey: "OWNER" } }, include: { user: { select: { email: true, name: true } } }, take: 1 } } } } });
  const owner = st.organization.members[0]?.user;
  if (!owner) return;
  const fr = st.organization.locale !== "en";
  const { bytes } = await statementPdf(st.id);
  const month = formatDate(st.periodStart, st.organization.timezone, fr ? "fr" : "en");
  await sendEmail({
    to: owner.email,
    template: "finance.statement",
    category: "SERVICE",
    organizationId: st.organizationId,
    subject: fr ? `Relevé de commissions ${st.number}` : `Commission statement ${st.number}`,
    text: fr ? `Bonjour ${owner.name},\n\nVotre relevé de commissions ${st.number} (période commençant le ${month}) est joint à cet e-mail. Il est aussi disponible dans la page Finances.\n\nEvoly` : `Hi ${owner.name},\n\nYour commission statement ${st.number} (period starting ${month}) is attached. It's also available on the Finances page.\n\nEvoly`,
    html: `<p>${fr ? `Bonjour ${owner.name},` : `Hi ${owner.name},`}</p><p>${fr ? `Votre relevé de commissions <strong>${st.number}</strong> est joint à cet e-mail. Il est aussi disponible dans la page Finances.` : `Your commission statement <strong>${st.number}</strong> is attached. It's also available on the Finances page.`}</p><p>Evoly</p>`,
    attachments: [{ filename: `${st.number}.pdf`, content: Buffer.from(bytes), contentType: "application/pdf" }],
  });
}

/** Relevés du mois précédent pour toutes les organisations (tâche planifiée mensuelle). */
export async function issuePreviousMonthStatements(now = new Date()) {
  const orgs = await db.organization.findMany({ where: { orders: { some: { applicationFeeMinor: { gt: 0 }, paidAt: { gte: new Date(now.getTime() - 40 * 86_400_000) } } } }, select: { id: true, timezone: true, currency: true } });
  let issued = 0;
  for (const o of orgs) {
    const local = utcToZonedLocal(now, o.timezone);
    const [y, m] = [Number(local.slice(0, 4)), Number(local.slice(5, 7))];
    const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
    await issueStatement(o.id, `${py}-${String(pm).padStart(2, "0")}`, o.currency, now).then(() => (issued += 1)).catch(() => undefined);
  }
  return issued;
}

const csvCell = (v: string | number | null | undefined) => {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const amount = (minor: number) => (minor / 100).toFixed(2).replace(".", ",");

/** Exports CSV (section 9.16) : séparateur « ; », virgule décimale, BOM pour Excel. */
export async function ordersCsv(ctx: OrgContext, opts: { period: Period; eventId?: string }): Promise<string> {
  const range = periodRange(opts.period, ctx.organization.timezone);
  const orders = await periodOrders(ctx.organization.id, range, opts.eventId);
  const titles = new Map((await db.event.findMany({ where: { organizationId: ctx.organization.id }, select: { id: true, title: true } })).map((e) => [e.id, e.title]));
  const head = ["Référence", "Date", "Événement", "Acheteur", "E-mail", "Billets", "Montant", "Remboursé", "Commission Evoly", "Frais bancaires", "Net", "Devise", "Statut", "Source", "Moyen de paiement"];
  const lines = orders.map((o) => [o.reference, utcToZonedLocal(o.paidAt!, ctx.organization.timezone).replace("T", " "), titles.get(o.eventId) ?? "", `${o.buyerFirstName} ${o.buyerLastName}`, o.buyerEmail, o._count.tickets, amount(o.totalMinor), amount(o.refundedMinor), amount(o.applicationFeeMinor), o.paymentFeeMinor != null ? amount(o.paymentFeeMinor) : "", o.netMinor != null ? amount(o.netMinor) : "", o.currency, o.status, o.source, o.paymentMethodType ?? ""]);
  return "\ufeff" + [head, ...lines].map((l) => l.map(csvCell).join(";")).join("\r\n") + "\r\n";
}

export async function ticketsCsv(ctx: OrgContext, opts: { period: Period; eventId?: string; withAnswers?: boolean }): Promise<string> {
  const range = periodRange(opts.period, ctx.organization.timezone);
  const tickets = await db.ticket.findMany({
    where: { order: { organizationId: ctx.organization.id, status: { in: [...COUNTED] }, paidAt: { not: null, ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lt: range.to } : {}) } }, ...(opts.eventId ? { eventId: opts.eventId } : {}) },
    include: { order: { select: { id: true, reference: true, buyerEmail: true, currency: true } }, ticketType: { select: { name: true } }, event: { select: { title: true } } },
    orderBy: { createdAt: "asc" },
  });
  // RG-STAT-04 : export des participants d'un événement, réponses aux questions comprises (une colonne par question)
  const questions = opts.withAnswers && opts.eventId ? await db.checkoutQuestion.findMany({ where: { eventId: opts.eventId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, label: true, scope: true } }) : [];
  const answers = questions.length ? await db.questionAnswer.findMany({ where: { orderId: { in: [...new Set(tickets.map((t) => t.order.id))] } }, select: { questionId: true, orderId: true, ticketId: true, value: true } }) : [];
  const answerText = (v: unknown) => {
    const x = (v as { value?: unknown } | null)?.value;
    return Array.isArray(x) ? x.join(", ") : typeof x === "boolean" ? (x ? "oui" : "non") : x == null ? "" : String(x);
  };
  const answerFor = (q: (typeof questions)[number], t: (typeof tickets)[number]) => answerText(answers.find((a) => a.questionId === q.id && a.orderId === t.order.id && (q.scope === "TICKET" ? a.ticketId === t.id : !a.ticketId))?.value);
  const head = ["Référence commande", "Code", "Événement", "Tarif", "Titulaire", "E-mail du titulaire", "E-mail de l'acheteur", "Prix payé", "Devise", "Statut", "Entrée", ...questions.map((q) => q.label)];
  const lines = tickets.map((t) => [t.order.reference, t.shortCode, t.event.title, t.ticketType.name, t.holderFirstName ? `${t.holderFirstName} ${t.holderLastName ?? ""}`.trim() : "", t.holderEmail ?? "", t.order.buyerEmail, amount(t.faceValueMinor), t.order.currency, t.status, t.checkedInAt ? utcToZonedLocal(t.checkedInAt, ctx.organization.timezone).replace("T", " ") : "", ...questions.map((q) => answerFor(q, t))]);
  return "\ufeff" + [head, ...lines].map((l) => l.map(csvCell).join(";")).join("\r\n") + "\r\n";
}
