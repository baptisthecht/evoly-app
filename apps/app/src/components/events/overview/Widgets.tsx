import { formatMoney, type Locale } from "@evoly/i18n";
import Link from "next/link";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import type { eventOverview, SalesPeriod } from "@/server/eventOverview";
import { SubmitOnChange } from "./SubmitOnChange";

type T = (key: string, values?: Record<string, string | number>) => string;
type Overview = Awaited<ReturnType<typeof eventOverview>>;

/** Carte de chiffre de la vue d'ensemble (maquette validée). */
export function Kpi({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1.5 rounded-lg bg-surface-raised px-3.5 py-3.5 ring-1 ring-line sm:px-[1.125rem] sm:py-4">
      <span className="text-xs text-ink-muted">{label}</span>
      <span className="text-xl font-semibold tracking-[-0.02em] tabular-nums sm:text-2xl">{value}</span>
      {children}
    </div>
  );
}

export function Gauge({ ratio }: { ratio: number }) {
  return (
    <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-line">
      <div className="h-full rounded-full bg-success" style={{ width: `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%` }} />
    </div>
  );
}

/** Ventes par jour : barres, la dernière (aujourd'hui) foncée ; choix de la période par lien. */
export function SalesChart({
  o,
  t,
  period,
  base,
  locale,
  className,
}: {
  o: Overview;
  t: T;
  period: SalesPeriod;
  base: string;
  locale: Locale;
  className?: string;
}) {
  const max = Math.max(1, ...o.days.map((d) => d.tickets));
  const total = o.days.reduce((n, d) => n + d.tickets, 0);
  const w = 700;
  const gap = o.days.length > 30 ? 2 : 6;
  const bw = (w - gap * (o.days.length - 1)) / o.days.length;
  const first = o.days[0]!.day;
  const firstLabel = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${first}T12:00:00Z`));
  return (
    <Card className={cn("grid min-w-0 gap-3.5", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[0.9375rem] font-semibold">{t(period === "7" ? "salesTitle7" : period === "14" ? "salesTitle14" : "salesTitleAll")}</h2>
        <nav aria-label={t("period")} className="inline-flex overflow-hidden rounded-md ring-1 ring-line-strong">
          {(["7", "14", "all"] as const).map((p) => (
            <Link
              key={p}
              href={`${base}?ventes=${p}`}
              aria-current={p === period ? "true" : undefined}
              scroll={false}
              className={
                p === period
                  ? "inline-flex min-h-9 items-center bg-surface-inverse px-3 text-[0.8125rem] font-medium text-ink-inverse"
                  : "inline-flex min-h-9 items-center bg-surface-raised px-3 text-[0.8125rem] font-medium text-ink-muted hover:text-ink"
              }
            >
              {t(p === "7" ? "period7" : p === "14" ? "period14" : "periodAll")}
            </Link>
          ))}
        </nav>
      </div>
      <svg role="img" aria-label={t("chartLabel", { total })} viewBox={`0 0 ${w} 184`} className="h-48 w-full">
        <line x1="0" y1="180" x2={w} y2="180" stroke="var(--line)" />
        <line x1="0" y1="120" x2={w} y2="120" stroke="var(--line)" strokeOpacity="0.5" />
        <line x1="0" y1="60" x2={w} y2="60" stroke="var(--line)" strokeOpacity="0.5" />
        {o.days.map((d, i) => {
          const h = d.tickets ? Math.max(4, (d.tickets / max) * 160) : 2;
          return (
            <rect
              key={d.day}
              x={i * (bw + gap)}
              y={180 - h}
              width={bw}
              height={h}
              rx={Math.min(4, bw / 3)}
              fill={d.day === o.today ? "var(--ink)" : "var(--line-strong)"}
            />
          );
        })}
      </svg>
      <div aria-hidden="true" className="-mt-2 flex justify-between text-xs text-ink-muted">
        <span>{firstLabel}</span>
        <span>{t("today")}</span>
      </div>
    </Card>
  );
}

/** Tarifs et leur remplissage ; ventes par palier pour les prix dynamiques (RG-TKT-11). */
export function TiersCard({
  t,
  locale,
  currency,
  types,
  tiersSold,
  ticketsHref,
}: {
  t: T;
  locale: Locale;
  currency: string;
  types: Array<{ id: string; name: string; priceMinor: number; quantity: number | null; quantitySold: number }>;
  tiersSold: Map<string, Array<{ name: string; sold: number }>>;
  ticketsHref: string | null;
}) {
  return (
    <Card className="grid content-start gap-3.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[0.9375rem] font-semibold">{t("tiersTitle")}</h2>
        {ticketsHref ? (
          <Link href={ticketsHref} className="text-[0.8125rem] text-ink-muted hover:text-ink">
            {t("manage")}
          </Link>
        ) : null}
      </div>
      {types.map((tt) => {
        const soldOut = tt.quantity !== null && tt.quantitySold >= tt.quantity;
        const tiers = tiersSold.get(tt.id) ?? [];
        return (
          <div key={tt.id} className="grid gap-1.5">
            <div className="flex justify-between gap-3 text-[0.8125rem]">
              <span className="truncate font-medium">
                {tt.name} · {formatMoney(tt.priceMinor, currency, locale)}
              </span>
              <span className={soldOut ? "shrink-0 font-medium text-success" : "shrink-0 text-ink-muted tabular-nums"}>
                {soldOut
                  ? t("soldOut")
                  : tt.quantity !== null
                    ? t("soldOf", { sold: tt.quantitySold, total: tt.quantity })
                    : t("soldUnlimited", { sold: tt.quantitySold })}
              </span>
            </div>
            {tt.quantity !== null ? <Gauge ratio={tt.quantitySold / Math.max(1, tt.quantity)} /> : null}
            {tiers.length > 1 ? (
              <span className="text-xs text-ink-muted" data-testid="tier-sales">
                {tiers.map((x) => `${x.name} : ${x.sold}`).join(" · ")}
              </span>
            ) : null}
          </div>
        );
      })}
      {ticketsHref ? (
        <Link
          href={ticketsHref}
          className="mt-auto inline-flex min-h-11 items-center justify-center rounded-md border border-dashed border-line-strong text-[0.8125rem] font-medium text-ink-muted hover:text-ink"
        >
          {t("addTier")}
        </Link>
      ) : null}
    </Card>
  );
}

/** Dernières commandes : recherche et filtre menant à la page des commandes, export, statuts colorés. */
export function RecentOrders({
  o,
  t,
  locale,
  ordersHref,
  exportHref,
  showAmounts,
}: {
  o: Overview;
  t: T;
  locale: Locale;
  ordersHref: string;
  exportHref: string;
  showAmounts: boolean;
}) {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const ago = (d: Date) => {
    const s = (d.getTime() - Date.now()) / 1000;
    for (const [unit, n] of [
      ["day", 86400],
      ["hour", 3600],
      ["minute", 60],
    ] as const)
      if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), unit);
    return rtf.format(0, "minute");
  };
  const tone = { PAID: "bg-success-soft text-success", PARTIALLY_REFUNDED: "bg-warning-soft text-ink", REFUNDED: "bg-surface text-ink-muted" } as const;
  return (
    <section aria-labelledby="recent-orders" className="overflow-hidden rounded-lg bg-surface-raised ring-1 ring-line">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 id="recent-orders" className="text-[0.9375rem] font-semibold">
          {t("recentOrders")}
        </h2>
        <form action={ordersHref} className="flex flex-wrap gap-2" role="search" aria-label={t("search")}>
          <div className="relative w-full sm:w-auto">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
            <input
              name="q"
              aria-label={t("search")}
              placeholder={t("searchPlaceholder")}
              className="h-11 w-full rounded-md sm:w-80 bg-surface-raised pr-3 pl-9 text-[0.8125rem] shadow-[inset_0_0_0_1px_var(--line-strong)] outline-none focus:shadow-[var(--field-focus)]"
            />
          </div>
          <SubmitOnChange
            name="filter"
            aria-label={t("status")}
            defaultValue="ALL"
            className="h-11 rounded-md bg-surface-raised px-3 text-[0.8125rem] shadow-[inset_0_0_0_1px_var(--line-strong)]"
          >
            <option value="ALL">{t("allStatuses")}</option>
            {(["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] as const).map((s) => (
              <option key={s} value={s}>
                {t(s)}
              </option>
            ))}
          </SubmitOnChange>
          <a
            href={exportHref}
            className="inline-flex h-11 items-center rounded-md bg-surface-raised px-3.5 text-[0.8125rem] font-medium shadow-[inset_0_0_0_1px_var(--line-strong)] hover:shadow-[inset_0_0_0_1px_var(--ink)]"
          >
            {t("export")}
          </a>
        </form>
      </div>
      {o.recent.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[0.8125rem]">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th className="px-5 py-2.5 font-medium">{t("buyer")}</th>
                <th className="px-3 py-2.5 font-medium">{t("tickets")}</th>
                {showAmounts ? <th className="px-3 py-2.5 font-medium">{t("amount")}</th> : null}
                <th className="px-3 py-2.5 font-medium">{t("status")}</th>
                <th className="px-5 py-2.5 text-right font-medium">{t("date")}</th>
              </tr>
            </thead>
            <tbody>
              {o.recent.map((r) => (
                <tr key={r.id} className="border-t border-line">
                  <td className="px-5 py-3">
                    <Link href={`${ordersHref}/${r.id}`} className="font-medium hover:underline">
                      {r.buyer}
                    </Link>
                    <br />
                    <span className="text-xs text-ink-muted">{r.email}</span>
                  </td>
                  <td className="px-3 py-3">{r.lines}</td>
                  {showAmounts ? <td className="px-3 py-3 tabular-nums">{formatMoney(r.totalMinor, r.currency, locale)}</td> : null}
                  <td className="px-3 py-3">
                    <span className={cn("inline-flex h-[1.375rem] items-center rounded-sm px-2 text-xs font-medium", tone[r.status])}>{t(r.status)}</span>
                  </td>
                  <td className="px-5 py-3 text-right whitespace-nowrap text-ink-muted">{ago(r.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-6 text-[0.8125rem] text-ink-muted">{t("noOrders")}</p>
      )}
      <div className="flex justify-end border-t border-line px-5 py-3">
        <Link href={ordersHref} className="text-[0.8125rem] text-ink-muted hover:text-ink">
          {t("allOrders")}
        </Link>
      </div>
    </section>
  );
}
