import type { SalesPaceResult } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { EventStatusBadge } from "@/components/events/StatusBadge";
import { cn } from "@/components/ui/cn";
import { DateLeaf, SalesGauge } from "@/components/ui/SalesGauge";

export interface EventsTableRow {
  id: string;
  title: string;
  status: Parameters<typeof EventStatusBadge>[0]["status"];
  currency: string;
  collectedMinor: number;
  startsAt: Date;
  timezone: string;
  place: string;
  sold: number;
  capacity: number | null;
  pace: SalesPaceResult;
}

const dayOf = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
const daysBetween = (d: Date, tz: string) =>
  Math.round(
    (Date.parse(dayOf(d, tz)) - Date.parse(dayOf(new Date(), tz))) / 86_400_000,
  );

/**
 * Tableau des événements (refonte A3, maquettes UIUX/) : feuille de calendrier, date relative, jauge du rythme,
 * encaissé, statut. Les événements passés montrent leur bilan à la place de la jauge.
 */
export async function EventsTable({
  events,
  base,
  locale,
  money,
  past = false,
}: {
  events: EventsTableRow[];
  base: string;
  locale: Locale;
  money: boolean;
  past?: boolean;
}) {
  const t = await getTranslations("dashboard");
  const te = await getTranslations("events");
  const th =
    "px-2.5 py-2 text-left text-[0.8125rem] font-medium text-ink-muted";
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] border-collapse text-[0.875rem]">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={th}>
              {t("colEvent")}
            </th>
            <th scope="col" className={th}>
              {t("colDate")}
            </th>
            <th scope="col" className={cn(th, "w-[17rem]")}>
              {t("colSales")}
            </th>
            {money ? (
              <th scope="col" className={cn(th, "text-right")}>
                {t("colCollected")}
              </th>
            ) : null}
            <th scope="col" className={th}>
              {t("colStatus")}
            </th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => {
            const days = daysBetween(e.startsAt, e.timezone);
            const draft = e.status === "DRAFT";
            const weekday = new Intl.DateTimeFormat(locale, {
              timeZone: e.timezone,
              weekday: "long",
            }).format(e.startsAt);
            return (
              <tr
                key={e.id}
                className="border-b border-line align-middle hover:bg-surface-sunken/50"
              >
                <td className="px-2.5 py-2.5">
                  <Link
                    href={`${base}/events/${e.id}`}
                    className="flex min-w-0 items-center gap-3"
                  >
                    <DateLeaf
                      date={e.startsAt}
                      timezone={e.timezone}
                      locale={locale}
                      draft={draft}
                    />
                    <span className="grid min-w-0">
                      <span className="truncate font-semibold">{e.title}</span>
                      {e.place ? (
                        <span className="truncate text-[0.8125rem] text-ink-muted">
                          {e.place}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </td>
                <td className="px-2.5 py-2.5 whitespace-nowrap">
                  {days >= 0
                    ? t("inDays", { count: days })
                    : t("daysAgo", { count: -days })}
                  <br />
                  <span className="text-[0.8125rem] text-ink-muted">
                    {weekday}
                  </span>
                </td>
                <td className="px-2.5 py-2.5">
                  {draft ? (
                    <span className="text-[0.8125rem] text-ink-muted">
                      {t("notOnSale")}
                    </span>
                  ) : past ? (
                    <span className="text-[0.8125rem] tabular-nums">
                      {e.capacity != null
                        ? te("soldOf", { sold: e.sold, total: e.capacity })
                        : te("soldCount", { sold: e.sold })}
                    </span>
                  ) : (
                    <SalesGauge
                      sold={e.sold}
                      capacity={e.capacity}
                      pace={e.pace}
                      timezone={e.timezone}
                      locale={locale}
                    />
                  )}
                </td>
                {money ? (
                  <td className="px-2.5 py-2.5 text-right whitespace-nowrap tabular-nums">
                    {draft ? (
                      <span className="text-ink-muted">-</span>
                    ) : (
                      formatMoney(e.collectedMinor, e.currency, locale)
                    )}
                  </td>
                ) : null}
                <td className="px-2.5 py-2.5">
                  <EventStatusBadge status={e.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
