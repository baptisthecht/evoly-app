import { can, salesPace, salesWindow } from "@evoly/core";
import {
  formatDateTime,
  formatDayMonth,
  formatMoney,
  type Locale,
} from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CopyButton } from "@/components/CopyButton";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { HighlightBand } from "@/components/ui/HighlightBand";
import { SalesGauge } from "@/components/ui/SalesGauge";
import { cn } from "@/components/ui/cn";
import { requireOrgContext } from "@/server/context";
import { eventPublicationBlockers, getEventWithTickets } from "@/server/events";
import { eventShortUrl } from "@/server/urls";
import { canonicalEventUrl } from "@/server/canonical";
import { EventCommand } from "./EventCommands";
import { AutoRefresh } from "@/components/public/AutoRefresh";
import { db } from "@/lib/db";
import { CheckIcon } from "@/components/ui/icons";
import {
  Gauge,
  Kpi,
  RecentOrders,
  SalesChart,
  TiersCard,
} from "@/components/events/overview/Widgets";
import { eventOverview, parsePeriod } from "@/server/eventOverview";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("tabOverview") };
}

export default async function EventOverview({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
  searchParams: Promise<{ ventes?: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const period = parsePeriod((await searchParams).ventes);
  const ctx = await requireOrgContext(orgSlug);
  const event = await getEventWithTickets(ctx, eventId);
  const t = await getTranslations("events");
  const locale = (await getLocale()) as Locale;
  const blockers =
    event.status === "DRAFT" || event.status === "SALES_PAUSED"
      ? await eventPublicationBlockers(ctx, eventId)
      : [];
  const url = await canonicalEventUrl(
    {
      id: ctx.organization.id,
      subdomain: ctx.organization.subdomain,
      slug: ctx.organization.slug,
      features: ctx.features,
    },
    event,
  ); // RG-DOM-06
  const short = eventShortUrl(event.publicCode);
  const canPublish = can(ctx.membership, "EVENTS_PUBLISH") && !ctx.readOnly;
  const sold = event.ticketTypes.reduce((n, tt) => n + tt.quantitySold, 0);
  // billets vendus par palier (commandes payées), pour les tarifs à prix dynamiques
  const tierRows = await db.orderItem.groupBy({
    by: ["ticketTypeId", "priceTierId"],
    where: {
      order: { eventId, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } },
    },
    _sum: { quantity: true },
  });
  const tierNames = new Map(
    (
      await db.priceTier.findMany({
        where: { ticketType: { eventId } },
        select: { id: true, name: true },
      })
    ).map((t) => [t.id, t.name]),
  );
  const tiersSold = new Map<string, Array<{ name: string; sold: number }>>();
  for (const r of tierRows) {
    const list = tiersSold.get(r.ticketTypeId) ?? [];
    list.push({
      name: r.priceTierId
        ? (tierNames.get(r.priceTierId) ?? "-")
        : t("basePrice"),
      sold: r._sum.quantity ?? 0,
    });
    tiersSold.set(r.ticketTypeId, list);
  }
  const gross = event.ticketTypes.reduce(
    (n, tt) => n + tt.quantitySold * tt.priceMinor,
    0,
  );
  const checks = [
    {
      key: "NO_TICKET_TYPE",
      done: !blockers.includes("NO_TICKET_TYPE"),
      href: `/o/${orgSlug}/events/${eventId}/tickets`,
    },
    {
      key: "STRIPE_REQUIRED",
      done: !blockers.includes("STRIPE_REQUIRED"),
      href: `/o/${orgSlug}/settings/payments`,
    },
    {
      key: "IN_THE_PAST",
      done: !blockers.includes("IN_THE_PAST"),
      href: `/o/${orgSlug}/events/${eventId}/settings`,
    },
  ];
  const isLive =
    event.status === "PUBLISHED" || event.status === "SALES_PAUSED";
  const o = await eventOverview(eventId, event.timezone, period);
  const ov = await getTranslations("overview");
  const money = can(ctx.membership, "FINANCE_VIEW");
  const base = `/o/${orgSlug}/events/${eventId}`;
  // refonte A3 : le bandeau du rythme (packages/core/src/pace.ts), tant que l'événement est en vente et à venir
  const pace = salesPace({
    sold,
    capacity: o.capacity,
    ...salesWindow(event),
    now: new Date(),
  });
  const td = await getTranslations("dashboard");
  const tz = event.timezone;
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const daysLeft = Math.round(
    (Date.parse(dayKey(event.startsAt)) - Date.parse(dayKey(new Date()))) /
      86_400_000,
  );
  const showPace = isLive && daysLeft >= 0;
  const soldOutAt =
    pace.pace === "ahead" && pace.soldOutAt
      ? formatDayMonth(pace.soldOutAt, tz, locale)
      : null;
  return (
    <div className="grid gap-5">
      {/* US-STAT-01 : ventes et remplissage à jour sans recharger la page */}
      <AutoRefresh everyMs={5_000} maxTimes={720} />
      {event.status === "DRAFT" || event.status === "SALES_PAUSED" ? (
        <Card className="grid gap-4">
          <h2 className="text-[0.9375rem] font-semibold">
            {t(event.status === "DRAFT" ? "checklistTitle" : "pausedTitle")}
          </h2>
          <ul className="grid gap-3">
            {checks.map((c) => (
              <li key={c.key} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                    c.done
                      ? "bg-success text-blanc"
                      : "bg-surface-sunken text-ink-muted ring-1 ring-line-strong",
                  )}
                >
                  {c.done ? <CheckIcon strokeWidth={3} /> : null}
                </span>
                <div className="grid gap-0.5">
                  <p className={cn("font-medium", c.done && "text-ink-muted")}>
                    {t(`check_${c.key}`)}
                  </p>
                  {!c.done ? (
                    <Link
                      href={c.href}
                      className="text-sm font-semibold underline underline-offset-4"
                    >
                      {t(`checkFix_${c.key}`)}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-3">
            {canPublish && blockers.length === 0 ? (
              <EventCommand
                orgSlug={orgSlug}
                eventId={eventId}
                command={event.status === "DRAFT" ? "publish" : "resume"}
                variant="primary"
              />
            ) : null}
            <Link
              href={`${base}/preview`}
              className={buttonClass("secondary", "lg")}
            >
              {t("preview")}
            </Link>
          </div>
        </Card>
      ) : null}

      {showPace ? (
        <HighlightBand
          aria-labelledby="pace-title"
          className="md:grid-cols-[minmax(0,1.2fr)_auto_minmax(0,1.3fr)] md:items-center md:gap-7"
        >
          <div className="grid min-w-0 gap-0.5">
            <p className="text-[0.8125rem] font-semibold text-highlight-ink">
              {ov(`pace_${pace.pace}`)}
            </p>
            <h2 id="pace-title" className="text-lg leading-snug font-semibold">
              {soldOutAt
                ? ov("soldOutAround", {
                    date: `${soldOutAt.day} ${soldOutAt.month}`,
                  })
                : formatDateTime(event.startsAt, tz, locale, "long")}
            </h2>
            {soldOutAt ? (
              <p className="text-[0.8125rem] text-ink-muted">
                {formatDateTime(event.startsAt, tz, locale, "long")}
              </p>
            ) : null}
          </div>
          <div className="md:border-x md:border-highlight-line md:px-7 md:text-center">
            <p className="font-figures text-[2.5rem] leading-none tracking-[-0.05em] whitespace-nowrap">
              {daysLeft === 0
                ? td("countdownToday")
                : daysLeft === 1
                  ? td("countdownTomorrow")
                  : td("countdown", { count: daysLeft })}
            </p>
            {daysLeft > 1 ? (
              <p className="mt-1 text-[0.8125rem] text-ink-muted">
                {td("beforeStart")}
              </p>
            ) : null}
          </div>
          <div className="grid gap-2.5">
            <SalesGauge
              sold={sold}
              capacity={o.capacity}
              pace={pace}
              timezone={tz}
              locale={locale}
            />
            <div className="flex flex-wrap gap-2">
              <CopyButton value={url} label={td("copyLink")} />
            </div>
          </div>
        </HighlightBand>
      ) : null}

      <section
        aria-label={ov("kpis")}
        className="grid grid-cols-2 gap-x-6 gap-y-5 border-b border-line pb-5 xl:grid-cols-4 xl:gap-x-0 xl:divide-x xl:divide-line xl:[&>*]:px-8 xl:[&>*:first-child]:pl-0"
      >
        {money ? (
          <Kpi
            label={ov("netRevenue")}
            value={formatMoney(o.netMinor, event.currency, locale)}
          >
            <span
              className={
                o.weekNetMinor > 0
                  ? "text-xs text-success"
                  : "text-xs text-ink-muted"
              }
            >
              {ov("thisWeek", {
                amount: formatMoney(o.weekNetMinor, event.currency, locale),
              })}
            </span>
            <span className="text-xs text-ink-muted">
              {t("statGross")} : {formatMoney(gross, event.currency, locale)}
            </span>
          </Kpi>
        ) : null}
        <Kpi
          label={t("statSold")}
          value={
            <>
              {sold}
              {o.capacity !== null ? (
                <span className="ml-1.5 font-sans text-sm font-normal tracking-normal text-ink-muted">
                  {ov("ofCapacity", { n: o.capacity })}
                </span>
              ) : null}
            </>
          }
        >
          {o.capacity !== null && !showPace ? (
            <Gauge ratio={sold / Math.max(1, o.capacity)} />
          ) : null}
        </Kpi>
        <Kpi label={ov("visits")} value={o.views}>
          <span className="text-xs text-ink-muted">
            {o.conversionPct !== null
              ? ov("conversion", { pct: o.conversionPct })
              : ov("visitsHint")}
          </span>
          <span className="text-xs text-ink-muted">
            {ov("ordersCount", { n: o.ordersCount })}
          </span>
          {money && o.ordersCount ? (
            <span className="text-xs text-ink-muted">
              {ov("averageBasket", {
                amount: formatMoney(
                  o.averageBasketMinor,
                  event.currency,
                  locale,
                ),
              })}
            </span>
          ) : null}
        </Kpi>
        <Kpi label={ov("resale")} value={o.resaleActive}>
          <span className="text-xs text-ink-muted">{ov("resaleHint")}</span>
        </Kpi>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <SalesChart
          o={o}
          t={ov}
          period={period}
          base={base}
          locale={locale}
          className="lg:col-span-2"
        />
        <TiersCard
          t={ov}
          locale={locale}
          currency={event.currency}
          types={event.ticketTypes}
          tiersSold={tiersSold}
          ticketsHref={
            can(ctx.membership, "EVENTS_EDIT") && !ctx.readOnly
              ? `${base}/tickets`
              : null
          }
        />
      </div>

      {can(ctx.membership, "ORDERS_VIEW") ? (
        <RecentOrders
          o={o}
          t={ov}
          locale={locale}
          ordersHref={`${base}/orders`}
          exportHref={`${base}/participants`}
          showAmounts={money}
        />
      ) : null}

      {/* refonte A3 : liens et actions en sections, sans carte */}
      <div className="grid gap-8 border-t border-line pt-5 lg:grid-cols-2">
        {isLive ? (
          <section className="grid content-start gap-4">
            <h2 className="text-[0.9375rem] font-semibold">
              {t("linksTitle")}
            </h2>
            {[
              { label: t("linkPage"), value: url },
              { label: t("linkShort"), value: short },
            ].map((l) => (
              <div key={l.label} className="grid min-w-0 gap-2">
                <p className="text-[0.8125rem] text-ink-muted">{l.label}</p>
                <div className="flex min-w-0 items-center gap-2">
                  <a
                    href={l.value}
                    target="_blank"
                    rel="noreferrer"
                    className="min-w-0 flex-1 truncate rounded-md bg-surface-sunken px-3 py-2.5 font-mono text-sm"
                  >
                    {l.value.replace(/^https?:\/\//, "")}
                  </a>
                  <CopyButton value={l.value} />
                </div>
              </div>
            ))}
          </section>
        ) : null}
        <section className="grid content-start gap-3">
          <h2 className="text-[0.9375rem] font-semibold">
            {t("actionsTitle")}
          </h2>
          {canPublish && event.status === "PUBLISHED" ? (
            <EventCommand orgSlug={orgSlug} eventId={eventId} command="pause" />
          ) : null}
          {isLive ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className={buttonClass("secondary", "md", "w-full")}
            >
              {t("openPublicPage")}
            </a>
          ) : null}
          {can(ctx.membership, "ORDERS_VIEW") ? (
            <a
              href={`${base}/participants`}
              className={buttonClass("secondary", "md", "w-full")}
            >
              {t("exportParticipants")}
            </a>
          ) : null}
          {event.status === "CANCELLED" ? (
            <p className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
              {t("cancelledNotice", { reason: event.cancellationReason ?? "" })}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
