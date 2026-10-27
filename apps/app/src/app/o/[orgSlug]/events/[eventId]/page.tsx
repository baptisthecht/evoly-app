import { can } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CopyButton } from "@/components/CopyButton";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
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
  return (
    <div className="grid gap-5">
      {/* US-STAT-01 : ventes et remplissage à jour sans recharger la page */}
      <AutoRefresh everyMs={5_000} maxTimes={720} />
      {event.status === "DRAFT" || event.status === "SALES_PAUSED" ? (
        <Card className="grid gap-4">
          <h2 className="font-display text-xl tracking-[var(--tracking-title)]">
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

      <section
        aria-label={ov("kpis")}
        className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"
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
                <span className="ml-1.5 text-sm font-normal text-ink-muted">
                  {ov("ofCapacity", { n: o.capacity })}
                </span>
              ) : null}
            </>
          }
        >
          {o.capacity !== null ? (
            <Gauge ratio={sold / Math.max(1, o.capacity)} />
          ) : null}
        </Kpi>
        <Kpi label={ov("visits")} value={o.views}>
          <span className="text-xs text-ink-muted">
            {o.conversionPct !== null
              ? ov("conversion", { pct: o.conversionPct })
              : ov("visitsHint")}{" "}
            · {ov("ordersCount", { n: o.ordersCount })}
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

      <div className="grid gap-4 lg:grid-cols-3">
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

      <div className="grid gap-4 lg:grid-cols-2">
        {isLive ? (
          <Card className="grid content-start gap-4">
            <h2 className="font-display text-xl tracking-[var(--tracking-title)]">
              {t("linksTitle")}
            </h2>
            {[
              { label: t("linkPage"), value: url },
              { label: t("linkShort"), value: short },
            ].map((l) => (
              <div key={l.label} className="grid min-w-0 gap-2">
                <p className="font-label text-[0.8rem] font-bold text-ink-muted">
                  {l.label}
                </p>
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
          </Card>
        ) : null}
        <Card className="grid content-start gap-3">
          <h2 className="font-display text-lg tracking-[var(--tracking-title)]">
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
              className={buttonClass("secondary", "lg", "w-full")}
            >
              {t("openPublicPage")}
            </a>
          ) : null}
          {can(ctx.membership, "ORDERS_VIEW") ? (
            <a
              href={`${base}/participants`}
              className={buttonClass("secondary", "lg", "w-full")}
            >
              {t("exportParticipants")}
            </a>
          ) : null}
          {event.status === "CANCELLED" ? (
            <p className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
              {t("cancelledNotice", { reason: event.cancellationReason ?? "" })}
            </p>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
