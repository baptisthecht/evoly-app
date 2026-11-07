import { can, salesPace, salesWindow } from "@evoly/core";
import { formatEventWhen, formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/Button";
import { SectionTitle } from "@/components/ui/Controls";
import {
  BandCountdown,
  BandKicker,
  BandText,
  BandTitle,
  HighlightBand,
} from "@/components/ui/HighlightBand";
import { Gauge } from "@/components/ui/SalesGauge";
import { Stat, StatCell, StatRow } from "@/components/ui/Stat";
import { cn } from "@/components/ui/cn";
import { requireOrgContext } from "@/server/context";
import { eventPublicationBlockers, getEventWithTickets } from "@/server/events";
import { EventCommand } from "./EventCommands";
import { AutoRefresh } from "@/components/public/AutoRefresh";
import { CheckIcon } from "@/components/ui/icons";
import {
  RecentOrders,
  TicketsSpark,
  TiersTable,
} from "@/components/events/overview/Widgets";
import { eventOverview } from "@/server/eventOverview";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("tabOverview") };
}

export default async function EventOverview({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await getEventWithTickets(ctx, eventId);
  const [t, ov, td] = await Promise.all([
    getTranslations("events"),
    getTranslations("overview"),
    getTranslations("dashboard"),
  ]);
  const locale = (await getLocale()) as Locale;
  const blockers =
    event.status === "DRAFT" || event.status === "SALES_PAUSED"
      ? await eventPublicationBlockers(ctx, eventId)
      : [];
  const canPublish = can(ctx.membership, "EVENTS_PUBLISH") && !ctx.readOnly;
  const sold = event.ticketTypes.reduce((n, tt) => n + tt.quantitySold, 0);
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
  const o = await eventOverview(eventId, event.timezone, "30");
  const money = can(ctx.membership, "FINANCE_VIEW");
  const base = `/o/${orgSlug}/events/${eventId}`;
  // refonte A3 : le bandeau du rythme (packages/core/src/pace.ts), tant que l'événement est en vente et à venir
  const pace = salesPace({
    sold,
    capacity: o.capacity,
    ...salesWindow(event),
    now: new Date(),
  });
  const tz = event.timezone;
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
  const daysBetween = (a: Date, b: Date) =>
    Math.round((Date.parse(dayKey(a)) - Date.parse(dayKey(b))) / 86_400_000);
  const daysLeft = daysBetween(event.startsAt, new Date());
  const showPace = isLive && daysLeft >= 0;
  const projected =
    pace.pace === "ahead" && pace.soldOutAt ? pace.soldOutAt : null;
  const longDay = (d: Date) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      day: "numeric",
      month: "long",
    }).format(d);
  const where = [event.locationName, event.city].filter(Boolean).join(", ");
  const tone =
    pace.pace === "ahead" || pace.pace === "soldOut"
      ? "text-success"
      : pace.pace === "behind"
        ? "text-warning"
        : "text-ink-muted";
  const pct = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const signed = (n: number, text: string) =>
    n > 0 ? `+${text}` : n < 0 ? `\u2212${text}` : text;
  const weekTickets = o.days.slice(-7).reduce((n, d) => n + d.tickets, 0);
  const perOrder = o.ordersCount
    ? new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
        o.ticketsSold / o.ordersCount,
      )
    : null;
  const ticketsHref =
    can(ctx.membership, "EVENTS_EDIT") && !ctx.readOnly
      ? `${base}/tickets`
      : null;

  // refonte A3 (maquette UIUX/pages-a3.html) : 24 px entre les blocs ; le bandeau, les indicateurs, les tarifs et les
  // dernières commandes. Les liens à partager et les visites sont dans Vente, Diffusion ; l'export des participants dans
  // Participants ; la mise en pause des ventes dans Réglages, Vente.
  return (
    // sur téléphone, 16 px entre les blocs (maquette « Sur téléphone »)
    <div className="grid gap-4 sm:gap-6">
      {/* US-STAT-01 : ventes et remplissage à jour sans recharger la page */}
      <AutoRefresh everyMs={5_000} maxTimes={720} />
      {event.status === "DRAFT" || event.status === "SALES_PAUSED" ? (
        <section aria-labelledby="checklist">
          <SectionTitle
            id="checklist"
            title={t(
              event.status === "DRAFT" ? "checklistTitle" : "pausedTitle",
            )}
          />
          <ul role="list">
            {checks.map((c) => (
              <li
                key={c.key}
                className="flex items-center gap-2.5 border-b border-line py-[9px]"
              >
                {c.done ? (
                  <CheckIcon
                    className="size-4 shrink-0 text-success"
                    strokeWidth={2.2}
                    strokeLinecap="butt"
                    strokeLinejoin="miter"
                  />
                ) : (
                  <span
                    aria-hidden="true"
                    className="size-4 shrink-0 rounded-full border-[1.5px] border-check-line"
                  />
                )}
                <span
                  className={cn("min-w-0 flex-1", c.done && "text-ink-muted")}
                >
                  {t(`check_${c.key}`)}
                </span>
                {!c.done ? (
                  <Link
                    href={c.href}
                    className="shrink-0 text-[13px] font-medium underline underline-offset-[3px]"
                  >
                    {t(`checkFix_${c.key}`)}
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="mt-3.5 flex flex-wrap gap-2">
            {canPublish && blockers.length === 0 ? (
              <EventCommand
                orgSlug={orgSlug}
                eventId={eventId}
                command={event.status === "DRAFT" ? "publish" : "resume"}
                variant="primary"
              />
            ) : null}
            <Link href={`${base}/preview`} className={buttonClass("secondary")}>
              {t("preview")}
            </Link>
          </div>
        </section>
      ) : null}

      {showPace ? (
        <HighlightBand
          aria-labelledby="pace-title"
          className="md:grid-cols-[minmax(0,1.3fr)_auto_minmax(0,1.2fr)]"
        >
          <div className="min-w-0">
            <BandKicker>{ov(`pace_${pace.pace}`)}</BandKicker>
            <BandTitle>
              <span id="pace-title">
                {projected
                  ? ov("soldOutAround", { date: longDay(projected) })
                  : formatEventWhen(event.startsAt, tz, locale)}
              </span>
            </BandTitle>
            {/* sur téléphone, la phrase disparaît (maquette « Sur téléphone ») */}
            <div className="max-md:hidden">
              <BandText>
                {projected
                  ? `${ov("aheadText", {
                      count: Math.max(
                        0,
                        daysBetween(event.startsAt, projected),
                      ),
                    })} ${ov("waitlistHint")}`
                  : where}
              </BandText>
            </div>
          </div>
          <BandCountdown
            value={
              daysLeft === 0
                ? td("countdownToday")
                : daysLeft === 1
                  ? td("countdownTomorrow")
                  : td("countdown", { count: daysLeft })
            }
            caption={daysLeft > 1 ? td("beforeDoors") : null}
          />
          <div>
            {o.capacity !== null ? (
              // sur téléphone : la jauge d'abord, puis « 312 sur 400, il reste 88 places », sans le pourcentage
              <div className="flex flex-col-reverse gap-2.5 md:block">
                <p className="flex justify-between gap-3 text-[13px] tabular-nums md:mb-[5px]">
                  <span>
                    <b className="font-normal md:font-semibold">
                      {ov("soldOf", { sold, total: o.capacity })}
                    </b>
                    ,{" "}
                    {ov("remaining", { count: Math.max(0, o.capacity - sold) })}
                  </span>
                  <span className={cn("text-[12.5px] max-md:hidden", tone)}>
                    {pct.format(sold / Math.max(1, o.capacity))}
                  </span>
                </p>
                <Gauge
                  ratio={sold / Math.max(1, o.capacity)}
                  tone={
                    pace.pace === "soldOut"
                      ? "success"
                      : pace.pace === "behind"
                        ? "warning"
                        : "ink"
                  }
                  marker={
                    pace.elapsedRatio != null &&
                    pace.pace !== "soldOut" &&
                    pace.pace !== "notStarted"
                      ? pace.elapsedRatio
                      : null
                  }
                />
              </div>
            ) : (
              <p className="text-[13px] tabular-nums">
                <b className="font-semibold">{ov("soldUnlimited", { sold })}</b>
              </p>
            )}
            {pace.pace === "ahead" || pace.pace === "soldOut" ? (
              <div className="mt-2.5 flex flex-wrap gap-2 max-md:hidden">
                <Link
                  href={`${base}/waitlist`}
                  className={buttonClass("secondary")}
                >
                  {ov("openWaitlist")}
                </Link>
              </div>
            ) : null}
          </div>
        </HighlightBand>
      ) : null}

      <StatRow
        label={ov("kpis")}
        aside={<TicketsSpark days={o.days} label={ov("ticketsSpark")} />}
      >
        {money ? (
          <StatCell>
            <Stat
              label={ov("collected")}
              value={formatMoney(o.netMinor, event.currency, locale)}
              sub={
                o.weekNetMinor
                  ? ov("weekDelta", {
                      value: signed(
                        o.weekNetMinor,
                        formatMoney(
                          Math.abs(o.weekNetMinor),
                          event.currency,
                          locale,
                          {
                            units: true,
                          },
                        ),
                      ),
                    })
                  : null
              }
              subTone={o.weekNetMinor > 0 ? "success" : "muted"}
            />
          </StatCell>
        ) : null}
        <StatCell>
          <Stat
            label={ov("ticketsSold")}
            value={sold}
            sub={
              weekTickets
                ? ov("weekDelta", {
                    value: signed(weekTickets, String(weekTickets)),
                  })
                : null
            }
            subTone={weekTickets > 0 ? "success" : "muted"}
          />
        </StatCell>
        {/* sur téléphone, deux indicateurs (maquette « Sur téléphone ») */}
        <StatCell className="max-sm:hidden">
          <Stat
            label={ov("orders")}
            value={o.ordersCount}
            sub={perOrder ? ov("perOrder", { value: perOrder }) : null}
          />
        </StatCell>
      </StatRow>

      <div className="grid gap-4 sm:gap-8 lg:grid-cols-2 lg:gap-9">
        <TiersTable
          t={ov}
          locale={locale}
          currency={event.currency}
          timezone={tz}
          types={event.ticketTypes}
          ticketsHref={ticketsHref}
        />
        {can(ctx.membership, "ORDERS_VIEW") ? (
          <RecentOrders
            o={o}
            t={ov}
            locale={locale}
            ordersHref={`${base}/orders`}
            orderBase={`/o/${orgSlug}/orders`}
            showAmounts={money}
          />
        ) : null}
      </div>

      {event.status === "CANCELLED" ? (
        <p className="rounded-[8px] bg-danger-soft px-3 py-2.5 text-[13px] text-danger">
          {t("cancelledNotice", { reason: event.cancellationReason ?? "" })}
        </p>
      ) : null}
    </div>
  );
}
