import { formatDate, formatMoney, type Locale } from "@evoly/i18n";
import Link from "next/link";
import { SectionTitle } from "@/components/ui/Controls";
import { Gauge } from "@/components/ui/SalesGauge";
import type { eventOverview } from "@/server/eventOverview";

/*
 * Vue d'ensemble d'un événement, refonte A3 (maquette UIUX/pages-a3.html, « Vue d'ensemble d'un événement ») : le bandeau
 * du rythme, trois indicateurs et l'histogramme des billets vendus jour par jour, les tarifs en lignes avec leur jauge, les
 * dernières commandes.
 */

type Overview = Awaited<ReturnType<typeof eventOverview>>;
type T = (key: string, values?: Record<string, string | number>) => string;

/** Les billets vendus jour par jour (30 jours) : barres grises, la dernière en charbon (« .spark », 280 × 52). */
export function TicketsSpark({
  days,
  label,
}: {
  days: Overview["days"];
  label: string;
}) {
  const W = 280;
  const H = 52;
  const gap = 3;
  const n = Math.max(1, days.length);
  const bw = (W - gap * (n - 1)) / n;
  const max = Math.max(1, ...days.map((d) => d.tickets));
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-[52px] w-[280px] max-w-full"
      role="img"
      aria-label={label}
    >
      {days.map((d, i) => {
        const h = Math.max(2, (d.tickets / max) * (H - 4));
        return (
          <rect
            key={d.day}
            x={i * (bw + gap)}
            y={H - h}
            width={bw}
            height={h}
            rx={1.5}
            fill={
              i === days.length - 1 ? "var(--ink-strong)" : "var(--control-off)"
            }
          >
            <title>{`${d.day} : ${d.tickets}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

interface TierRow {
  id: string;
  name: string;
  description: string | null;
  priceMinor: number;
  quantity: number | null;
  quantitySold: number;
  salesEndAt: Date | null;
}

/** Les tarifs (« Tarifs » de la maquette) : nom et période, prix, puis ventes sur la jauge (verte au complet). */
export function TiersTable({
  t,
  locale,
  currency,
  timezone,
  types,
  ticketsHref,
}: {
  t: T;
  locale: Locale;
  currency: string;
  timezone: string;
  types: TierRow[];
  ticketsHref: string | null;
}) {
  return (
    <section aria-labelledby="tiers-title" className="min-w-0">
      <SectionTitle
        id="tiers-title"
        title={t("tiersTitle")}
        link={
          ticketsHref
            ? { href: ticketsHref, label: t("manageTickets") }
            : undefined
        }
        className="max-md:[&>a]:hidden"
      />
      {/* sur téléphone (maquette « Sur téléphone », « .ocard ») : le nom et le prix, la jauge, puis les ventes */}
      <ul role="list" className="md:hidden">
        {types.map((tt) => {
          const full = tt.quantity !== null && tt.quantitySold >= tt.quantity;
          return (
            <li key={tt.id} className="grid gap-1 border-b border-line py-3">
              <p className="flex items-baseline justify-between gap-3">
                <b className="font-semibold">{tt.name}</b>
                <span className="tabular-nums">
                  {tt.priceMinor === 0
                    ? t("free")
                    : formatMoney(tt.priceMinor, currency, locale)}
                </span>
              </p>
              {tt.quantity !== null ? (
                <Gauge
                  ratio={tt.quantitySold / Math.max(1, tt.quantity)}
                  tone={full ? "success" : "ink"}
                />
              ) : null}
              <p className="flex items-center justify-between gap-3 text-[13px] text-ink-muted tabular-nums">
                <span>
                  {tt.quantity !== null
                    ? t("soldOf", { sold: tt.quantitySold, total: tt.quantity })
                    : t("soldUnlimited", { sold: tt.quantitySold })}
                </span>
                {full ? (
                  <span className="text-[12.5px] text-success">
                    {t("complete")}
                  </span>
                ) : null}
              </p>
            </li>
          );
        })}
      </ul>
      <table className="w-full border-collapse max-md:hidden">
        <tbody>
          {types.map((tt) => {
            const full = tt.quantity !== null && tt.quantitySold >= tt.quantity;
            const sub =
              tt.description ||
              (tt.salesEndAt
                ? t("untilDate", {
                    date: formatDate(tt.salesEndAt, timezone, locale).replace(
                      /\s\d{4}$/,
                      "",
                    ),
                  })
                : null);
            return (
              <tr key={tt.id}>
                <td className="border-b border-line p-2.5 align-middle tabular-nums">
                  <b className="font-semibold">{tt.name}</b>
                  {sub ? (
                    <>
                      <br />
                      <small className="text-[12.5px] text-ink-muted">
                        {sub}
                      </small>
                    </>
                  ) : null}
                </td>
                <td className="w-20 border-b border-line p-2.5 text-right align-middle whitespace-nowrap tabular-nums">
                  {tt.priceMinor === 0
                    ? t("free")
                    : formatMoney(tt.priceMinor, currency, locale)}
                </td>
                <td className="w-[170px] border-b border-line p-2.5 align-middle tabular-nums">
                  {tt.quantity !== null ? (
                    <>
                      <div className="mb-1 flex justify-between text-[12.5px]">
                        <span>
                          {t("soldOf", {
                            sold: tt.quantitySold,
                            total: tt.quantity,
                          })}
                        </span>
                        {full ? (
                          <span className="text-success">{t("complete")}</span>
                        ) : null}
                      </div>
                      <Gauge
                        ratio={tt.quantitySold / Math.max(1, tt.quantity)}
                        tone={full ? "success" : "ink"}
                      />
                    </>
                  ) : (
                    <span className="text-[12.5px]">
                      {t("soldUnlimited", { sold: tt.quantitySold })}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/** Les dernières commandes (« .row ») : le nom, les billets et leur tarif, le montant et quand. */
export function RecentOrders({
  o,
  t,
  locale,
  ordersHref,
  orderBase,
  showAmounts,
}: {
  o: Overview;
  t: T;
  locale: Locale;
  ordersHref: string;
  /** Adresse des fiches de commande (« /o/club/orders »). */
  orderBase: string;
  showAmounts: boolean;
}) {
  const rtf = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
    style: "short",
  });
  const ago = (d: Date) => {
    const m = Math.round((d.getTime() - Date.now()) / 60_000);
    if (Math.abs(m) < 60) return rtf.format(m, "minute");
    const h = Math.round(m / 60);
    if (Math.abs(h) < 24) return rtf.format(h, "hour");
    return rtf.format(Math.round(h / 24), "day");
  };
  return (
    <section aria-labelledby="recent-title" className="min-w-0">
      <SectionTitle
        id="recent-title"
        title={t("recentOrders")}
        link={{ href: ordersHref, label: t("allOrders") }}
      />
      {o.recent.length === 0 ? (
        <p className="border-b border-line py-[9px] text-ink-muted">
          {t("noOrders")}
        </p>
      ) : (
        <ul role="list">
          {o.recent.slice(0, 3).map((r) => (
            <li key={r.id} className="border-b border-line">
              <Link
                href={`${orderBase}/${r.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-[9px] hover:bg-surface-hover"
              >
                <span className="min-w-0">
                  <b className="font-medium">{r.buyer}</b>
                  <small className="block text-[12.5px] text-ink-muted">
                    {r.complimentary
                      ? t("invitations", { count: r.tickets })
                      : r.ticketType
                        ? t("ticketsOfType", {
                            count: r.tickets,
                            type: r.ticketType,
                          })
                        : t("ticketsCount", { count: r.tickets })}
                  </small>
                </span>
                <span className="text-right tabular-nums">
                  {showAmounts
                    ? r.complimentary
                      ? t("offered")
                      : formatMoney(r.totalMinor, r.currency, locale)
                    : null}
                  <small className="block text-[12.5px] text-ink-muted">
                    {ago(r.at)}
                  </small>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
