import { can } from "@evoly/core";
import { formatDate, formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/Button";
import { Badge, Card, EmptyState } from "@/components/ui/Card";
import { Select } from "@/components/ui/Field";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";
import { financeOverview, statementMonths, stripeOverview, type Period } from "@/server/finances";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("finances") };
}

const PERIODS: Period[] = ["THIS_MONTH", "LAST_MONTH", "LAST_30_DAYS", "THIS_YEAR", "ALL"];

/** Section 9.16 : ventes, commissions, frais, net ; compte Stripe ; relevés ; exports. */
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
  const period = (PERIODS as string[]).includes(sp.period ?? "") ? (sp.period as Period) : "THIS_MONTH";
  const eventId = sp.event || undefined;
  const [overview, stripeInfo, months, events] = await Promise.all([
    financeOverview(ctx, { period, eventId }),
    stripeOverview(ctx),
    statementMonths(ctx),
    db.event.findMany({
      where: { organizationId: ctx.organization.id, deletedAt: null, status: { not: "DRAFT" } },
      select: { id: true, title: true },
      orderBy: { startsAt: "desc" },
    }),
  ]);
  const t = await getTranslations("finances");
  const locale = (await getLocale()) as Locale;
  const money = (v: number, c = overview.currency) => formatMoney(v, c, locale);
  const tot = overview.totals;
  const query = new URLSearchParams({ period, ...(eventId ? { event: eventId } : {}) }).toString();
  const monthLabel = (p: string) => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${p}-15T12:00:00Z`));
  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="page-title">{t("title")}</h1>
        <form className="grid w-full gap-2 sm:w-auto sm:grid-cols-[12rem_14rem_auto]">
          <Select name="period" defaultValue={period} aria-label={t("period")}>
            {PERIODS.map((p) => (
              <option key={p} value={p}>
                {t(`period_${p}`)}
              </option>
            ))}
          </Select>
          <Select name="event" defaultValue={eventId ?? ""} aria-label={t("event")}>
            <option value="">{t("allEvents")}</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </Select>
          <button type="submit" className={buttonClass("dark", "md")}>
            {t("show")}
          </button>
        </form>
      </header>

      {!stripeInfo.connected ? (
        <Link href={`/o/${orgSlug}/settings/payments`} className="rounded-lg bg-info-soft px-5 py-4 font-semibold">
          {t("stripeNotConnected")} →
        </Link>
      ) : stripeInfo.status !== "ACTIVE" || stripeInfo.requirementsDue > 0 ? (
        <Link href={`/o/${orgSlug}/settings/payments`} className="rounded-lg bg-warning-soft px-5 py-4 font-semibold text-warning">
          {t(stripeInfo.status === "RESTRICTED" || stripeInfo.status === "DISABLED" ? "stripeRestricted" : "stripeActionRequired")} →
        </Link>
      ) : (
        <p className="flex items-center gap-2 text-sm">
          <span className="shrink-0 whitespace-nowrap">
            <Badge tone="success">{t("stripeActive")}</Badge>
          </span>
          <span className="text-ink-muted">{t("stripeActiveHint")}</span>
        </p>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" aria-label={t("totals")}>
        {[
          { key: "gross", value: tot.grossMinor, strong: false },
          { key: "refunded", value: -tot.refundedMinor, strong: false },
          { key: "commission", value: -tot.commissionMinor, strong: false },
          { key: "bankFees", value: -tot.bankFeeMinor, strong: false, note: tot.bankFeeEstimated ? t("estimated") : null },
          { key: "net", value: tot.netMinor, strong: true },
        ].map((c) =>
          c.strong ? (
            // carte du net : fond foncé posé directement (la carte standard impose son fond clair)
            <div key={c.key} className="grid content-start gap-1 rounded-lg bg-surface-inverse p-5 text-ink-inverse shadow-sm">
              <p className="font-label text-[0.8rem] font-bold opacity-80">{t(`card_${c.key}`)}</p>
              <p className="font-display text-2xl tracking-[-0.04em] tabular-nums">{money(c.value)}</p>
            </div>
          ) : (
            <Card key={c.key} className="grid content-start gap-1">
              <p className="font-label text-[0.8rem] font-bold text-ink-muted">{t(`card_${c.key}`)}</p>
              <p className="font-display text-2xl tracking-[-0.04em] tabular-nums">{money(c.value)}</p>
              {c.note ? <p className="text-xs text-ink-muted">{c.note}</p> : null}
            </Card>
          ),
        )}
      </section>
      <p className="-mt-3 text-sm text-ink-muted">{t("totalsHint", { orders: tot.orders, tickets: tot.tickets })}</p>

      <Card className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("byEvent")}</h2>
          <div className="flex flex-wrap gap-2">
            <a href={`/o/${orgSlug}/finances/export/orders?${query}`} className={buttonClass("secondary", "sm")}>
              {t("exportOrders")}
            </a>
            <a href={`/o/${orgSlug}/finances/export/tickets?${query}`} className={buttonClass("secondary", "sm")}>
              {t("exportTickets")}
            </a>
          </div>
        </div>
        {overview.byEvent.length === 0 ? (
          <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="text-left text-ink-muted">
                  {["colEvent", "colTickets", "colGross", "colRefunded", "colCommission", "colBankFees", "colNet"].map((h, i) => (
                    <th key={h} scope="col" className={`pb-2 font-label text-xs font-bold ${i > 0 ? "text-right" : ""}`}>
                      {t(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overview.byEvent.map((r) => (
                  <tr key={r.eventId} className="border-t border-line">
                    <th scope="row" className="py-2 pr-3 text-left font-semibold">
                      {r.title}
                    </th>
                    <td className="py-2 text-right tabular-nums">{r.tickets}</td>
                    <td className="py-2 text-right tabular-nums">{money(r.grossMinor)}</td>
                    <td className="py-2 text-right tabular-nums">{r.refundedMinor ? `−${money(r.refundedMinor)}` : "-"}</td>
                    <td className="py-2 text-right tabular-nums">{r.commissionMinor ? `−${money(r.commissionMinor)}` : "-"}</td>
                    <td className="py-2 text-right tabular-nums">{r.bankFeeMinor ? `−${money(r.bankFeeMinor)}` : "-"}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{money(r.netMinor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="grid content-start gap-3">
          <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("stripeTitle")}</h2>
          {stripeInfo.connected && stripeInfo.balance ? (
            <dl className="grid grid-cols-2 gap-3">
              <div>
                <dt className="font-label text-[0.8rem] font-bold text-ink-muted">{t("available")}</dt>
                <dd className="font-display text-xl tabular-nums">
                  {stripeInfo.balance.available.map((b) => money(b.amount, b.currency)).join(" · ") || money(0)}
                </dd>
              </div>
              <div>
                <dt className="font-label text-[0.8rem] font-bold text-ink-muted">{t("pending")}</dt>
                <dd className="font-display text-xl tabular-nums">
                  {stripeInfo.balance.pending.map((b) => money(b.amount, b.currency)).join(" · ") || money(0)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-ink-muted">{stripeInfo.connected ? t("stripeUnavailable") : t("stripeNotConnectedShort")}</p>
          )}
          {stripeInfo.connected && stripeInfo.payouts && stripeInfo.payouts.length > 0 ? (
            <ul className="grid gap-1 text-sm">
              {stripeInfo.payouts.map((p) => (
                <li key={p.id} className="flex justify-between gap-3 border-t border-line pt-1">
                  <span>{formatDate(p.arrivalDate, ctx.organization.timezone, locale)}</span>
                  <span className="tabular-nums">
                    {money(p.amount, p.currency)} · {t(`payout_${p.status}`)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-xs text-ink-muted">{t("noInternalBalance")}</p>
          {stripeInfo.connected ? (
            <a href="https://dashboard.stripe.com/" target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm", "justify-self-start")}>
              {t("openStripe")}
            </a>
          ) : null}
        </Card>

        <Card className="grid content-start gap-3">
          <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("statementsTitle")}</h2>
          <p className="-mt-1 text-sm text-ink-muted">{t("statementsIntro")}</p>
          {months.length === 0 ? <p className="text-sm text-ink-muted">{t("noStatements")}</p> : null}
          <ul className="grid gap-2">
            {months.slice(0, 12).map((m) => (
              <li key={`${m.period}-${m.currency}`} className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2 text-sm">
                <span>
                  <span className="font-semibold capitalize">{monthLabel(m.period)}</span> · {money(m.feesMinor, m.currency)}
                </span>
                {m.open ? (
                  <Badge>{t("statementOpen")}</Badge>
                ) : (
                  <a href={`/o/${orgSlug}/finances/statements/${m.period}`} className="font-semibold underline underline-offset-4">
                    {m.statement ? t("statementDownload", { number: m.statement.number }) : t("statementIssue")}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {stripeInfo.connected && stripeInfo.disputes.length > 0 ? (
        <Card className="grid gap-3 ring-2 ring-warning">
          <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("disputesTitle")}</h2>
          <ul className="grid gap-2 text-sm">
            {stripeInfo.disputes.map((d) => (
              <li key={d.id} className="flex flex-wrap justify-between gap-2 border-t border-line pt-2">
                <span>
                  {money(d.amountMinor, d.currency)} · {d.reason}
                  {d.order ? (
                    <>
                      {" "}
                      ·{" "}
                      <Link href={`/o/${orgSlug}/orders/${d.order.id}`} className="font-mono underline">
                        {d.order.reference}
                      </Link>
                    </>
                  ) : null}
                </span>
                <span className="font-semibold text-warning">
                  {d.evidenceDueBy ? t("disputeDue", { date: formatDate(d.evidenceDueBy, ctx.organization.timezone, locale) }) : t(`dispute_${d.status}`)}
                </span>
              </li>
            ))}
          </ul>
          <a href="https://dashboard.stripe.com/disputes" target="_blank" rel="noreferrer" className={buttonClass("dark", "sm", "justify-self-start")}>
            {t("answerDisputes")}
          </a>
        </Card>
      ) : null}
    </div>
  );
}
