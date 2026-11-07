import { can, growthPct } from "@evoly/core";
import { formatDate, formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/Controls";
import { Stat, StatCell, StatRow } from "@/components/ui/Stat";
import { requireOrgContext } from "@/server/context";
import { FinanceEventsTable } from "./FinanceTables";
import {
  financeOverview,
  statementMonths,
  stripeOverview,
  type Period,
} from "@/server/finances";
import { ArrowRightIcon } from "@/components/ui/icons";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("finances") };
}

const PERIODS: Period[] = [
  "LAST_30_DAYS",
  "THIS_MONTH",
  "LAST_MONTH",
  "THIS_YEAR",
  "ALL",
];

/**
 * Section 9.16, refonte A3 (maquette UIUX/pages-a3-suite.html, « Finances ») : les totaux se lisent comme un calcul
 * (ventes brutes, moins les remboursements, les commissions et les frais bancaires, égale le net), l'état du compte
 * Stripe, le tableau par événement avec sa ligne de total. La période et l'export sont dans la bande du titre. Ensuite,
 * hors maquette : options, compte Stripe et relevés, litiges.
 */
export default async function FinancesPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ period?: string; event?: string }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx.membership, "FINANCE_VIEW")) notFound();
  const period = (PERIODS as string[]).includes(sp.period ?? "")
    ? (sp.period as Period)
    : "LAST_30_DAYS";
  const eventId = sp.event || undefined;
  const [overview, stripeInfo, months] = await Promise.all([
    financeOverview(ctx, { period, eventId }),
    stripeOverview(ctx),
    statementMonths(ctx),
  ]);
  const t = await getTranslations("finances");
  const locale = (await getLocale()) as Locale;
  const money = (v: number, c = overview.currency) => formatMoney(v, c, locale);
  const tot = overview.totals;
  const query = new URLSearchParams({
    period,
    ...(eventId ? { event: eventId } : {}),
  }).toString();
  const monthLabel = (p: string) =>
    new Intl.DateTimeFormat(locale, {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${p}-15T12:00:00Z`));
  const growth =
    overview.previousNetMinor != null
      ? growthPct(tot.netMinor, overview.previousNetMinor)
      : null;
  const pct = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
    signDisplay: "exceptZero",
  });
  const minus = (v: number) => (v ? `\u2212${money(v)}` : money(0));
  return (
    <div className="grid gap-6">
      {!stripeInfo.connected ? (
        <Link
          href={`/o/${orgSlug}/settings/payments`}
          className="flex items-center justify-between gap-3 rounded-[10px] bg-info-soft px-3.5 py-2.5 text-[13.5px] font-medium text-info"
        >
          {t("stripeNotConnected")}
          <ArrowRightIcon className="size-4 shrink-0" />
        </Link>
      ) : stripeInfo.status !== "ACTIVE" || stripeInfo.requirementsDue > 0 ? (
        <Link
          href={`/o/${orgSlug}/settings/payments`}
          className="flex items-center justify-between gap-3 rounded-[10px] bg-warning-soft px-3.5 py-2.5 text-[13.5px] font-medium text-warning"
        >
          {t(
            stripeInfo.status === "RESTRICTED" ||
              stripeInfo.status === "DISABLED"
              ? "stripeRestricted"
              : "stripeActionRequired",
          )}
          <ArrowRightIcon className="size-4 shrink-0" />
        </Link>
      ) : null}

      {/* les totaux comme un calcul : cinq indicateurs, les retraits en rouge doux avec un vrai signe moins, le net en vert */}
      <StatRow label={t("totals")} compact>
        <StatCell>
          <Stat
            label={t("card_gross")}
            value={money(tot.grossMinor)}
            sub={t("ordersCount", { count: tot.orders })}
          />
        </StatCell>
        <StatCell>
          <Stat
            label={t("card_refunded")}
            value={minus(tot.refundedMinor)}
            valueTone={tot.refundedMinor ? "minus" : undefined}
            sub={t("ordersCount", { count: overview.refundedOrders })}
          />
        </StatCell>
        <StatCell>
          <Stat
            label={t("card_commission")}
            value={minus(tot.commissionMinor)}
            valueTone={tot.commissionMinor ? "minus" : undefined}
            sub={t("notReturned")}
          />
        </StatCell>
        <StatCell>
          <Stat
            label={t("card_bankFees")}
            value={minus(tot.bankFeeMinor)}
            valueTone={tot.bankFeeMinor ? "minus" : undefined}
            sub={tot.bankFeeEstimated ? t("partlyEstimated") : null}
          />
        </StatCell>
        <StatCell>
          <Stat
            label={t("card_net")}
            value={money(tot.netMinor)}
            valueTone="success"
            sub={
              growth != null
                ? t("growth", { value: pct.format(growth / 100) })
                : null
            }
            subTone={growth != null && growth > 0 ? "success" : "muted"}
          />
        </StatCell>
      </StatRow>

      {stripeInfo.connected &&
      stripeInfo.status === "ACTIVE" &&
      stripeInfo.requirementsDue === 0 ? (
        // l'état du compte Stripe (« .status ») : la coche verte, la phrase, « Ouvrir Stripe » à droite
        <p className="flex items-center gap-2 text-[13.5px]">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            className="size-4 shrink-0 text-success"
          >
            <path d="m5 12 5 5 9-10" />
          </svg>
          <b className="font-semibold">{t("stripeActiveLead")}</b>
          <span className="text-ink-muted">{t("stripeActiveHint")}</span>
          <a
            href="https://dashboard.stripe.com/"
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-[13px] font-medium whitespace-nowrap underline underline-offset-[3px]"
          >
            {t("openStripeShort")}
          </a>
        </p>
      ) : null}

      <section aria-labelledby="by-event">
        <SectionTitle
          id="by-event"
          title={t("byEvent")}
          link={{
            href: `/o/${orgSlug}/finances/export/tickets?${query}`,
            label: t("exportTickets"),
          }}
        />
        {overview.byEvent.length === 0 ? (
          <p className="border-b border-line py-[9px] text-ink-muted">
            {t("emptyTitle")} {t("emptyBody")}
          </p>
        ) : (
          <FinanceEventsTable
            locale={locale}
            labels={{
              caption: t("byEventCaption"),
              event: t("colEvent"),
              tickets: t("colTickets"),
              gross: t("colGross"),
              refunded: t("colRefunded"),
              commission: t("colCommission"),
              bankFees: t("colBankFees"),
              net: t("colNet"),
            }}
            rows={overview.byEvent.map((r) => ({
              id: r.eventId,
              title: r.title,
              state: r.free
                ? t("state_free")
                : r.status
                  ? t(`state_${r.status}`)
                  : "",
              startsAt: r.startsAt,
              timezone: r.timezone,
              free: r.free,
              tickets: r.tickets,
              gross: money(r.grossMinor),
              refunded: money(r.refundedMinor),
              refundedMinor: r.refundedMinor,
              commission: money(r.commissionMinor),
              commissionMinor: r.commissionMinor,
              bankFees: money(r.bankFeeMinor),
              bankFeeMinor: r.bankFeeMinor,
              net: money(r.netMinor),
              href: `/o/${orgSlug}/events/${r.eventId}`,
            }))}
            total={{
              label: t("totalRow"),
              tickets: tot.tickets,
              gross: money(tot.grossMinor),
              refunded: money(tot.refundedMinor),
              refundedMinor: tot.refundedMinor,
              commission: money(tot.commissionMinor),
              commissionMinor: tot.commissionMinor,
              bankFees: money(tot.bankFeeMinor),
              bankFeeMinor: tot.bankFeeMinor,
              net: money(tot.netMinor),
            }}
          />
        )}
        <p className="mt-2.5 text-[12.5px] text-ink-muted">{t("footnote")}</p>
      </section>

      {/* hors maquette, dans le même style : les options vendues, le compte Stripe, les relevés, les litiges */}
      {overview.options.rows.length ? (
        <section aria-labelledby="options-title">
          <SectionTitle
            id="options-title"
            title={t("optionsTitle")}
            link={{
              href: `/o/${orgSlug}/finances/export/options?${query}`,
              label: t("exportOptions"),
            }}
          />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse">
              <thead>
                <tr>
                  {[
                    ["optionCol", "text-left"],
                    ["optionEventCol", "text-left"],
                    ["optionSold", "text-right"],
                    ["optionRedeemed", "text-right"],
                    ["optionAmount", "text-right"],
                    ["optionFee", "text-right"],
                  ].map(([k, align]) => (
                    <th
                      key={k}
                      scope="col"
                      className={`border-b border-line px-2.5 py-[7px] text-[12.5px] leading-[normal] font-medium text-ink-muted ${align}`}
                    >
                      {t(k!)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="[&_:is(td,th)]:border-b [&_:is(td,th)]:border-line [&_:is(td,th)]:p-2.5 [&_td]:tabular-nums">
                {overview.options.rows.map((r) => (
                  <tr key={r.optionId}>
                    {/* le nom de l'option : en-tête de sa ligne (lecteurs d'écran) */}
                    <th scope="row" className="text-left font-semibold">
                      {r.name}
                    </th>
                    <td>{r.eventTitle}</td>
                    <td className="text-right">{r.sold}</td>
                    <td className="text-right">{r.redeemed}</td>
                    <td className="text-right">{money(r.amountMinor)}</td>
                    <td className="text-right">
                      {r.feeMinor ? (
                        <span className="text-minus">{minus(r.feeMinor)}</span>
                      ) : (
                        <span className="text-ink-faint">-</span>
                      )}
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold [&>td]:border-t-[1.5px] [&>td]:border-b-0 [&>td]:border-t-ink-strong">
                  <td colSpan={2}>{t("optionTotal")}</td>
                  <td className="text-right">{overview.options.totals.sold}</td>
                  <td className="text-right">
                    {overview.options.totals.redeemed}
                  </td>
                  <td className="text-right">
                    {money(overview.options.totals.amountMinor)}
                  </td>
                  <td className="text-right">
                    {overview.options.totals.feeMinor ? (
                      <span className="text-minus">
                        {minus(overview.options.totals.feeMinor)}
                      </span>
                    ) : (
                      <span className="text-ink-faint">-</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-2.5 text-[12.5px] text-ink-muted">
            {t("optionsHint")}
          </p>
        </section>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-9">
        <section aria-labelledby="stripe-title" className="min-w-0">
          <SectionTitle id="stripe-title" title={t("stripeTitle")} />
          {stripeInfo.connected && stripeInfo.balance ? (
            <dl className="grid grid-cols-2 border-b border-line pb-3">
              {[
                ["available", stripeInfo.balance.available],
                ["pending", stripeInfo.balance.pending],
              ].map(([k, list]) => (
                <div key={k as string}>
                  <dt className="text-[13px] text-ink-muted">
                    {t(k as string)}
                  </dt>
                  <dd className="mt-0.5 font-figures text-[20px] leading-[1.15] tracking-[var(--tracking-figures)] tabular-nums">
                    {(list as { amount: number; currency: string }[])
                      .map((b) => money(b.amount, b.currency))
                      .join(", ") || money(0)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="border-b border-line py-[9px] text-ink-muted">
              {stripeInfo.connected
                ? t("stripeUnavailable")
                : t("stripeNotConnectedShort")}
            </p>
          )}
          {stripeInfo.connected &&
          stripeInfo.payouts &&
          stripeInfo.payouts.length > 0 ? (
            <ul role="list">
              {stripeInfo.payouts.map((p) => (
                <li
                  key={p.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-line py-[9px]"
                >
                  <span>
                    {formatDate(
                      p.arrivalDate,
                      ctx.organization.timezone,
                      locale,
                    )}
                  </span>
                  <span className="text-right tabular-nums">
                    {money(p.amount, p.currency)}
                    <small className="block text-[12.5px] text-ink-muted">
                      {t(`payout_${p.status}`)}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="mt-2.5 text-[12.5px] text-ink-muted">
            {t("noInternalBalance")}
          </p>
        </section>

        <section aria-labelledby="statements-title" className="min-w-0">
          <SectionTitle id="statements-title" title={t("statementsTitle")} />
          {months.length === 0 ? (
            <p className="border-b border-line py-[9px] text-ink-muted">
              {t("noStatements")}
            </p>
          ) : (
            <ul role="list">
              {months.slice(0, 12).map((m) => (
                <li
                  key={`${m.period}-${m.currency}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-[9px]"
                >
                  <span>
                    <b className="font-medium first-letter:uppercase">
                      {monthLabel(m.period)}
                    </b>
                    <small className="block text-[12.5px] text-ink-muted">
                      {money(m.feesMinor, m.currency)}
                    </small>
                  </span>
                  {m.open ? (
                    <Badge>{t("statementOpen")}</Badge>
                  ) : (
                    <a
                      href={`/o/${orgSlug}/finances/statements/${m.period}`}
                      className="text-[13px] font-medium underline underline-offset-[3px]"
                    >
                      {m.statement
                        ? t("statementDownload", { number: m.statement.number })
                        : t("statementIssue")}
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2.5 text-[12.5px] text-ink-muted">
            {t("statementsIntro")}
          </p>
        </section>
      </div>

      {stripeInfo.connected && stripeInfo.disputes.length > 0 ? (
        <section aria-labelledby="disputes-title">
          <SectionTitle
            id="disputes-title"
            title={t("disputesTitle")}
            link={{
              href: "https://dashboard.stripe.com/disputes",
              label: t("answerDisputes"),
            }}
          />
          <ul role="list">
            {stripeInfo.disputes.map((d) => (
              <li
                key={d.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line py-[9px]"
              >
                <span>
                  <b className="font-medium">
                    {money(d.amountMinor, d.currency)}
                  </b>
                  <small className="block text-[12.5px] text-ink-muted">
                    {d.reason}
                    {d.order ? (
                      <>
                        {", "}
                        <Link
                          href={`/o/${orgSlug}/orders/${d.order.id}`}
                          className="underline underline-offset-[3px]"
                        >
                          {d.order.reference}
                        </Link>
                      </>
                    ) : null}
                  </small>
                </span>
                <span className="text-[13px] font-medium text-warning">
                  {d.evidenceDueBy
                    ? t("disputeDue", {
                        date: formatDate(
                          d.evidenceDueBy,
                          ctx.organization.timezone,
                          locale,
                        ),
                      })
                    : t(`dispute_${d.status}`)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
