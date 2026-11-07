import type { SalesPaceResult } from "@evoly/core";
import { formatMoney, formatTime, type Locale } from "@evoly/i18n";
import Link from "next/link";
import type { CSSProperties } from "react";
import { getTranslations } from "next-intl/server";
import { EventStatusBadge } from "@/components/events/StatusBadge";
import { cn } from "@/components/ui/cn";
import { DateLeaf, SalesGauge } from "@/components/ui/SalesGauge";
import { EventRowMenu } from "./EventRowMenu";

export interface EventsTableRow {
  id: string;
  title: string;
  status: Parameters<typeof EventStatusBadge>[0]["status"];
  currency: string;
  collectedMinor: number;
  startsAt: Date;
  salesStartAt: Date | null;
  timezone: string;
  /** Lieu et ville ; vide : « Lieu à préciser ». */
  place: string;
  sold: number;
  capacity: number | null;
  pace: SalesPaceResult;
  /** Tous les tarifs sont gratuits : « Gratuit » à la place de l'encaissé. */
  free?: boolean;
  /** Billets scannés à l'entrée (événements passés). */
  entries?: number;
  /** Adresse publique, pour « Copier le lien » du menu. */
  url?: string;
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

// refonte A3 (maquettes UIUX/) : en-têtes en 12,5 px gris, cellules à 10 px de marge, un filet fin sous chaque ligne
const th =
  "border-b border-line px-2.5 py-[7px] text-left text-[12.5px] leading-[normal] font-medium text-ink-muted";
const td = "border-b border-line p-2.5 align-middle tabular-nums";

/**
 * Tableau des événements (refonte A3, maquettes UIUX/) : feuille de calendrier, date relative, jauge du rythme, encaissé,
 * statut et menu. Le prochain événement peut être mis en avant (fond rose pâle, trait de 4 px). Les événements passés
 * montrent leur bilan (vendus, entrées) à la place de la jauge ; sans en-tête quand ils suivent la liste à venir.
 */
export async function EventsTable({
  events,
  base,
  locale,
  money,
  past = false,
  head = true,
  highlightFirst = false,
  withTime = true,
  menu = false,
  canDuplicate = false,
  salesWidth = 270,
}: {
  events: EventsTableRow[];
  base: string;
  locale: Locale;
  money: boolean;
  past?: boolean;
  /** Ligne des titres de colonnes (absente sous « Récemment passés »). */
  head?: boolean;
  highlightFirst?: boolean;
  /** L'heure après le jour de la semaine (« samedi, 20:00 »). */
  withTime?: boolean;
  /** Le menu « ⋯ » de chaque ligne (page Événements). */
  menu?: boolean;
  /** « Dupliquer » dans le menu (droit de créer un événement). */
  canDuplicate?: boolean;
  salesWidth?: number;
}) {
  const [t, te, tn] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("events"),
    getTranslations("nav"),
  ]);
  const now = Date.now();
  return (
    <div className="overflow-x-auto">
      {/* sur téléphone (maquette « Sur téléphone ») : l'événement et ses ventes seulement ; la feuille dit déjà la date */}
      <table className="w-full border-collapse sm:min-w-[44rem]">
        {head ? (
          <thead>
            <tr>
              <th scope="col" className={th}>
                {t("colEvent")}
              </th>
              <th scope="col" className={cn(th, "max-sm:hidden")}>
                {t("colDate")}
              </th>
              <th
                scope="col"
                className={cn(th, "sm:w-[var(--sales-w)]")}
                style={{ "--sales-w": `${salesWidth}px` } as CSSProperties}
              >
                {t("colSales")}
              </th>
              {money ? (
                <th scope="col" className={cn(th, "text-right max-sm:hidden")}>
                  {t("colCollected")}
                </th>
              ) : null}
              <th scope="col" className={cn(th, "max-sm:hidden")}>
                {t("colStatus")}
              </th>
              {menu ? (
                <th scope="col" className={cn(th, "max-sm:hidden")}>
                  <span className="sr-only">{te("actionsTitle")}</span>
                </th>
              ) : null}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {events.map((e, i) => {
            const days = daysBetween(e.startsAt, e.timezone);
            const draft = e.status === "DRAFT";
            const scheduled =
              e.status === "PUBLISHED" &&
              !!e.salesStartAt &&
              e.salesStartAt.getTime() > now;
            const weekday = new Intl.DateTimeFormat(locale, {
              timeZone: e.timezone,
              weekday: "long",
            }).format(e.startsAt);
            const on = highlightFirst && i === 0;
            const sold =
              e.capacity != null
                ? e.sold >= e.capacity
                  ? te("pastSoldOut", { sold: e.sold, total: e.capacity })
                  : te("pastSoldOf", { sold: e.sold, total: e.capacity })
                : te("soldCount", { sold: e.sold });
            return (
              <tr
                key={e.id}
                className={cn(
                  "[&>td]:transition-colors",
                  on
                    ? "[&>td]:bg-highlight-soft"
                    : "hover:[&>td]:bg-surface-hover",
                )}
              >
                {/* comme la maquette (« td.evl ») : la première cellule est une rangée flexible ; son rôle reste celui
                    d'une cellule pour les lecteurs d'écran */}
                <td
                  role="cell"
                  className={cn(td, "relative flex items-center")}
                >
                  {on ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-[var(--row-bar)] bg-highlight"
                    />
                  ) : null}
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
                    {/* comme la maquette : le titre en bloc, le lieu en ligne dans une ligne de 14 px */}
                    <span className="min-w-0">
                      <b className="block font-semibold">{e.title}</b>
                      <small className="text-[12.5px] text-ink-muted">
                        {e.place || te("placeTbd")}
                      </small>
                      {/* sur téléphone, la colonne Statut est masquée (écran sans maquette) : la pastille sous le lieu,
                          pour qu'un brouillon, un événement programmé ou annulé se voie dans la liste */}
                      <span className="mt-1 block sm:hidden">
                        <EventStatusBadge
                          status={e.status}
                          salesStartAt={e.salesStartAt}
                        />
                      </span>
                    </span>
                  </Link>
                </td>
                {past ? (
                  <td className={cn(td, "max-sm:hidden")}>
                    <small className="text-[12.5px] whitespace-nowrap text-ink-muted">
                      {t("daysAgo", { count: -days })}
                    </small>
                  </td>
                ) : (
                  <td className={cn(td, "whitespace-nowrap max-sm:hidden")}>
                    {days >= 0
                      ? t("inDays", { count: days })
                      : t("daysAgo", { count: -days })}
                    <br />
                    <small className="text-[12.5px] text-ink-muted">
                      {withTime && !draft
                        ? `${weekday}, ${formatTime(e.startsAt, e.timezone, locale)}`
                        : weekday}
                    </small>
                  </td>
                )}
                <td
                  className={cn(
                    td,
                    past && "text-[13px]",
                    past && !head && "sm:w-[var(--sales-w)]",
                  )}
                  style={
                    past && !head
                      ? ({ "--sales-w": `${salesWidth}px` } as CSSProperties)
                      : undefined
                  }
                >
                  {draft ? (
                    <span className="text-[13px] text-ink-muted">
                      {t("notOnSale")}
                    </span>
                  ) : past ? (
                    <>
                      {sold}
                      {e.entries != null ? (
                        <>
                          ,{" "}
                          <b className="font-semibold">
                            {te("entriesCount", { count: e.entries })}
                          </b>
                        </>
                      ) : null}
                    </>
                  ) : (
                    <SalesGauge
                      sold={e.sold}
                      capacity={e.capacity}
                      pace={e.pace}
                      timezone={e.timezone}
                      locale={locale}
                      opensAt={scheduled ? e.salesStartAt : null}
                    />
                  )}
                </td>
                {money ? (
                  <td
                    className={cn(
                      td,
                      "text-right whitespace-nowrap max-sm:hidden",
                      draft && "text-ink-muted",
                    )}
                  >
                    {draft || scheduled
                      ? "-"
                      : e.free
                        ? t("free")
                        : formatMoney(e.collectedMinor, e.currency, locale)}
                  </td>
                ) : null}
                <td className={cn(td, "max-sm:hidden")}>
                  <EventStatusBadge
                    status={e.status}
                    salesStartAt={e.salesStartAt}
                  />
                </td>
                {menu ? (
                  <td className={cn(td, "max-sm:hidden")}>
                    <EventRowMenu
                      base={base}
                      eventId={e.id}
                      title={e.title}
                      url={draft ? undefined : e.url}
                      labels={{
                        menu: te("rowActions", { title: e.title }),
                        open: te("open"),
                        preview: tn("previewPage"),
                        copy: tn("copyLink"),
                        copied: tn("linkCopied"),
                        duplicate: canDuplicate ? te("duplicate") : undefined,
                      }}
                    />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
