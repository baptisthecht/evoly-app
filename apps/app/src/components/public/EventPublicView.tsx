import { daysUntil, effectiveEnd } from "@evoly/core";
import { formatDate, formatTime, timeZoneLabel, type Locale } from "@evoly/i18n";
import { getLocale, getTranslations } from "next-intl/server";
import { OMark } from "../Brand";
import type { PublicEventData, PublicOrganization } from "@/server/publicEvents";
import { StickyTicketsButton } from "./StickyTicketsButton";
import type { PublicSeatMap } from "@/server/seating";
import { TicketPicker } from "./TicketPicker";
import { publicListings } from "@/server/resale";
import { formatMoney } from "@evoly/i18n";

/** Page de vente (section 9.10) : informations à gauche, billets à droite ; billets en premier sur téléphone. */
export async function EventPublicView({ org, data, preview = false, seatMap = null }: { org: PublicOrganization; data: PublicEventData; preview?: boolean; seatMap?: PublicSeatMap | null }) {
  const { event, ticketTypes, salesOpen } = data;
  const t = await getTranslations("public");
  const locale = (await getLocale()) as Locale;
  const now = new Date();
  const end = effectiveEnd(event.startsAt, event.endsAt);
  const sameDay = formatDate(event.startsAt, event.timezone, locale) === formatDate(end, event.timezone, locale);
  const countdown = event.status === "PUBLISHED" ? daysUntil(event.startsAt, now) : null;
  const place = [event.locationName, event.addressLine1, [event.postalCode, event.city].filter(Boolean).join(" ")].filter(Boolean);
  const mapsUrl = place.length ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(place.join(", "))}` : null;
  const state: "OPEN" | "NOT_STARTED" | "PAUSED" | "CLOSED" | "PREVIEW" = preview
    ? "PREVIEW"
    : event.status === "SALES_PAUSED"
      ? "PAUSED"
      : salesOpen
        ? "OPEN"
        : event.salesStartAt && event.salesStartAt > now
          ? "NOT_STARTED"
          : "CLOSED";
  const resale = !preview && event.resaleEnabled && event.showResaleSection ? await publicListings(event.id) : [];
  const resaleCard = resale.length ? (
    <section aria-labelledby="resale-title" className={`grid gap-3 rounded-[var(--r-panel)] p-5 ring-1 ring-line ${data.soldOut ? "bg-surface-accent" : "bg-surface-raised"}`}>
      <h2 id="resale-title" className="font-display text-xl tracking-[-0.03em]">
        {t("resaleTitle")}
      </h2>
      <p className="-mt-1 text-sm text-ink-muted">{t("resaleIntro")}</p>
      <ul className="grid gap-2">
        {resale.map((g) => (
          <li key={g.ticketTypeId}>
            <a href={`/revente/${g.listings[0]!.linkCode}`} className="flex items-center justify-between gap-3 rounded-lg bg-surface px-4 py-3 ring-1 ring-line hover:ring-ink">
              <span>
                <span className="font-semibold">{g.ticketTypeName}</span>
                <span className="text-sm text-ink-muted"> · {t("resaleCount", { count: g.count })}</span>
              </span>
              <span className="font-display text-lg tabular-nums">{g.fromMinor === 0 ? t("free") : t("resaleFrom", { price: formatMoney(g.fromMinor, event.currency, locale, { trimZeroCents: true }) })}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  ) : null;
  const tickets = ticketTypes.map((tt) => ({ ...tt, onSale: preview ? tt.remaining > 0 : tt.onSale, next: tt.next ? { priceMinor: tt.next.priceMinor, startsAt: tt.next.startsAt.toISOString() } : null }));

  return (
    <article className="pb-28 lg:pb-12">
      <header className="relative overflow-hidden bg-[var(--accent-panel,var(--evoly-charbon))] text-[var(--accent-panel-ink,var(--evoly-creme))]">
        {event.coverImageUrl ? <img src={event.coverImageUrl} alt="" className="absolute inset-0 size-full object-cover opacity-45" /> : <OMark className="pointer-events-none absolute -right-20 -bottom-24 size-[26rem] opacity-15" />}
        <div className="relative mx-auto grid max-w-6xl gap-4 px-5 pt-10 pb-12 sm:px-8 lg:pt-16 lg:pb-16">
          <p className="w-fit rounded-full bg-[var(--accent)] px-3 py-1 font-label text-xs font-bold text-[var(--accent-ink)]">
            {formatDate(event.startsAt, event.timezone, locale)}
          </p>
          <h1 className="max-w-4xl font-display text-[clamp(2.3rem,7vw,4.6rem)] leading-[0.95] tracking-[-0.05em] break-words">{event.title}</h1>
          <p className="text-lg opacity-85">
            {[formatTime(event.startsAt, event.timezone, locale), event.locationType === "ONLINE" ? t("online") : event.city ?? event.locationName].filter(Boolean).join(" · ")}
          </p>
        </div>
      </header>

      {event.status === "CANCELLED" ? <p className="mx-auto mt-6 max-w-6xl rounded-lg bg-danger-soft px-5 py-4 font-semibold text-danger sm:mx-8 lg:mx-auto">{t("cancelled")}</p> : null}
      {event.status === "ENDED" ? <p className="mx-auto mt-6 max-w-6xl rounded-lg bg-surface-sunken px-5 py-4 font-semibold sm:mx-8 lg:mx-auto">{t("ended")}</p> : null}

      <div className="mx-auto grid max-w-6xl gap-8 px-5 pt-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-12">
        <section id="billets" aria-labelledby="tickets-title" className="grid scroll-mt-24 gap-4 lg:sticky lg:top-6 lg:order-2 lg:self-start">
          {data.soldOut ? resaleCard : null}
          <div className="grid gap-4 rounded-[var(--r-panel)] bg-surface-raised p-5 shadow-md ring-1 ring-line">
            <h2 id="tickets-title" className="font-display text-2xl tracking-[-0.03em]">
              {t("tickets")}
            </h2>
            {tickets.length || event.status === "PUBLISHED" ? <TicketPicker tickets={tickets} currency={event.currency} timeZone={event.timezone} maxPerOrder={event.maxTicketsPerOrder} state={state} checkout={preview ? undefined : { eventId: event.id, organizationName: org.brand?.displayName ?? org.name, requirePhone: event.requireBuyerPhone, publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null }} seatMap={seatMap} /> : <p className="text-ink-muted">{t("noTickets")}</p>}
            {!preview ? (
              <a href="/billets" className="justify-self-center text-sm text-ink-muted underline underline-offset-4">
                {t("findTickets")}
              </a>
            ) : null}
          </div>
          {data.soldOut ? null : resaleCard}
        </section>

        <div className="grid content-start gap-8 lg:order-1">
          <section className="grid gap-5 sm:grid-cols-2" aria-label={t("practical")}>
            <div className="grid gap-1 rounded-lg bg-surface-sunken p-5">
              <p className="font-label text-xs font-bold text-ink-muted">{t("when")}</p>
              <p className="font-semibold">{formatDate(event.startsAt, event.timezone, locale)}</p>
              <p>
                {!event.endsAt
                  ? formatTime(event.startsAt, event.timezone, locale)
                  : sameDay
                    ? `${formatTime(event.startsAt, event.timezone, locale)} - ${formatTime(end, event.timezone, locale)}`
                    : `${formatTime(event.startsAt, event.timezone, locale)} → ${formatDate(end, event.timezone, locale)}, ${formatTime(end, event.timezone, locale)}`}{" "}
                <span className="text-sm text-ink-muted">({timeZoneLabel(event.startsAt, event.timezone, locale)})</span>
              </p>
              {countdown != null ? <p className="mt-1 text-sm font-semibold">{countdown === 0 ? t("today") : t("inDays", { count: countdown })}</p> : null}
            </div>
            <div className="grid gap-1 rounded-lg bg-surface-sunken p-5">
              <p className="font-label text-xs font-bold text-ink-muted">{t("where")}</p>
              {event.locationType !== "ONLINE" ? (
                <>
                  {place.map((line) => (
                    <p key={line} className="first:font-semibold">
                      {line}
                    </p>
                  ))}
                  {mapsUrl ? (
                    <a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-1 text-sm font-semibold underline underline-offset-4">
                      {t("directions")}
                    </a>
                  ) : null}
                </>
              ) : null}
              {event.locationType !== "PHYSICAL" ? <p className={event.locationType === "ONLINE" ? "font-semibold" : "text-sm"}>{t("onlineHint")}</p> : null}
            </div>
          </section>

          {event.summary ? (
            <section aria-labelledby="about-title" className="grid gap-3">
              <h2 id="about-title" className="font-display text-2xl tracking-[-0.03em]">
                {t("about")}
              </h2>
              <p className="max-w-prose text-[1.05rem] leading-relaxed whitespace-pre-line">{event.summary}</p>
            </section>
          ) : null}

          <section className="grid gap-1 border-t border-line pt-6">
            <p className="font-label text-xs font-bold text-ink-muted">{t("organizer")}</p>
            <p className="font-semibold">{org.brand?.displayName ?? org.name}</p>
          </section>
        </div>
      </div>

      {tickets.length && state === "OPEN" ? <StickyTicketsButton targetId="billets" label={t("seeTickets")} /> : null}
    </article>
  );
}
