import { formatDateTime, formatMoney, type Locale } from "@evoly/i18n";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CopyButton } from "@/components/CopyButton";
import { buttonClass } from "@/components/ui/Button";
import { HighlightBand } from "@/components/ui/HighlightBand";
import { DateLeaf, SalesGauge } from "@/components/ui/SalesGauge";
import type { homeOverview } from "@/server/home";

/*
 * Accueil, refonte A3 (docs/DECISIONS.md, maquette UIUX/propositions-a3.html, option 2) : des lignes plutôt que des
 * cartes, le bandeau rose du prochain événement, les feuilles de calendrier et la jauge du rythme.
 */

type Home = Awaited<ReturnType<typeof homeOverview>>;
const dayOf = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
/** Jours pleins entre aujourd'hui et la date de l'événement, dans son fuseau. */
const daysUntil = (d: Date, tz: string) =>
  Math.round(
    (Date.parse(dayOf(d, tz)) - Date.parse(dayOf(new Date(), tz))) / 86_400_000,
  );

const sectionTitle = "text-[0.9375rem] font-semibold";
const quietLink =
  "text-[0.8125rem] text-ink-muted underline-offset-4 hover:text-ink hover:underline";

/** La recette des 30 derniers jours, jour par jour, en petit histogramme à côté des indicateurs. */
export async function RevenueSpark({
  revenue,
  currency,
  locale,
}: {
  revenue: Home["revenue"];
  currency: string;
  locale: Locale;
}) {
  const t = await getTranslations("dashboard");
  const max = Math.max(1, ...revenue.map((d) => d.totalMinor));
  const W = 280;
  const H = 52;
  const gap = 3;
  const bw = (W - gap * (revenue.length - 1)) / revenue.length;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-13 w-full max-w-[17.5rem] self-end justify-self-end"
      role="img"
      aria-label={t("revenueChart")}
    >
      {revenue.map((d, i) => {
        const h = d.totalMinor
          ? Math.max(3, (d.totalMinor / max) * (H - 4))
          : 2;
        return (
          <rect
            key={d.day}
            x={i * (bw + gap)}
            y={H - h}
            width={bw}
            height={h}
            rx={1.5}
            fill={
              i === revenue.length - 1 ? "var(--ink)" : "var(--line-strong)"
            }
          >
            <title>{`${d.day} : ${formatMoney(d.totalMinor, currency, locale)}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

/**
 * Bandeau du prochain événement : compte à rebours, jauge du rythme et les deux actions les plus courantes.
 * Le trait rose est un rectangle découpé par l'arrondi du bandeau (arrondi à gauche, droit à droite), pas une bordure.
 */
export async function NextEventBand({
  next,
  url,
  base,
  locale,
}: {
  next: NonNullable<Home["next"]>;
  url: string;
  base: string;
  locale: Locale;
}) {
  const t = await getTranslations("dashboard");
  const days = daysUntil(next.startsAt, next.timezone);
  const big =
    days <= 0
      ? t("countdownToday")
      : days === 1
        ? t("countdownTomorrow")
        : t("countdown", { count: days });
  return (
    <HighlightBand
      aria-labelledby="next-event"
      className="md:grid-cols-[minmax(0,1.3fr)_auto_minmax(0,1.2fr)] md:items-center md:gap-7"
    >
      <div className="grid min-w-0 gap-0.5">
        <p className="text-[0.8125rem] font-semibold text-highlight-ink">
          {t("nextLabel")}
        </p>
        <h2 id="next-event" className="text-lg leading-snug font-semibold">
          <Link href={`${base}/events/${next.id}`} className="hover:underline">
            {next.title}
          </Link>
        </h2>
        <p className="text-[0.8125rem] text-ink-muted">
          {formatDateTime(next.startsAt, next.timezone, locale, "long")}
          {next.place ? `, ${next.place}` : null}
        </p>
      </div>
      <div className="md:border-x md:border-highlight-line md:px-7 md:text-center">
        <p className="font-figures text-[2.5rem] leading-none tracking-[-0.05em] whitespace-nowrap">
          {big}
        </p>
        {days > 1 ? (
          <p className="mt-1 text-[0.8125rem] text-ink-muted">
            {t("beforeStart")}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2.5">
        <SalesGauge
          sold={next.sold}
          capacity={next.capacity}
          pace={next.pace}
          timezone={next.timezone}
          locale={locale}
          projection
        />
        <div className="flex flex-wrap gap-2">
          <CopyButton value={url} label={t("copyLink")} />
          <Link
            href={`${base}/events/${next.id}`}
            className={buttonClass("secondary", "sm")}
          >
            {t("open")}
          </Link>
        </div>
      </div>
    </HighlightBand>
  );
}

/** Les événements suivants, chaque ligne ouverte par sa feuille de calendrier. */
export async function UpcomingTable({
  events,
  base,
  locale,
}: {
  events: Home["fill"];
  base: string;
  locale: Locale;
}) {
  const t = await getTranslations("dashboard");
  if (events.length === 0) return null;
  return (
    <section aria-labelledby="upcoming" className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="upcoming" className={sectionTitle}>
          {t("upcomingTitle")}
        </h2>
        <Link href={`${base}/events`} className={quietLink}>
          {t("allEvents")}
        </Link>
      </div>
      <ul role="list" className="grid">
        {events.map((e) => {
          const days = daysUntil(e.startsAt, e.timezone);
          return (
            <li key={e.id} className="border-b border-line first:border-t">
              <Link
                href={`${base}/events/${e.id}`}
                className="grid gap-3 py-2.5 hover:bg-surface-sunken/50 sm:grid-cols-[minmax(0,1fr)_8rem_minmax(0,18rem)] sm:items-center sm:gap-6"
              >
                <span className="flex min-w-0 items-center gap-3">
                  <DateLeaf
                    date={e.startsAt}
                    timezone={e.timezone}
                    locale={locale}
                  />
                  <span className="grid min-w-0">
                    <span className="truncate font-semibold">{e.title}</span>
                    {e.place ? (
                      <span className="truncate text-[0.8125rem] text-ink-muted">
                        {e.place}
                      </span>
                    ) : null}
                  </span>
                </span>
                <span className="text-[0.875rem] text-ink-muted max-sm:hidden">
                  {t("inDays", { count: Math.max(0, days) })}
                </span>
                <SalesGauge
                  sold={e.sold}
                  capacity={e.capacity}
                  pace={e.pace}
                  timezone={e.timezone}
                  locale={locale}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Les dernières commandes : le nom, le nombre de billets et l'événement, le montant. */
export async function LiveOrders({
  recent,
  base,
  locale,
  money,
}: {
  recent: Home["recent"];
  base: string;
  locale: Locale;
  money: boolean;
}) {
  const t = await getTranslations("dashboard");
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const ago = (d: Date) => {
    const m = Math.round((d.getTime() - Date.now()) / 60_000);
    if (Math.abs(m) < 60) return rtf.format(m, "minute");
    const h = Math.round(m / 60);
    if (Math.abs(h) < 24) return rtf.format(h, "hour");
    return rtf.format(Math.round(h / 24), "day");
  };
  return (
    <section
      aria-labelledby="recent-orders"
      className="grid content-start gap-1.5"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="recent-orders" className={sectionTitle}>
          {t("liveTitle")}
        </h2>
        <Link href={`${base}/orders`} className={quietLink}>
          {t("allOrders")}
        </Link>
      </div>
      {recent.length === 0 ? (
        <p className="border-t border-line py-3 text-[0.875rem] text-ink-muted">
          {t("liveEmpty")}
        </p>
      ) : (
        <ul role="list" className="grid">
          {recent.map((o) => (
            <li key={o.id} className="border-b border-line first:border-t">
              <Link
                href={`${base}/orders/${o.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-2.5 hover:bg-surface-sunken/50"
              >
                <span className="grid min-w-0">
                  <span className="truncate text-[0.875rem] font-medium">
                    {o.name}
                  </span>
                  <span className="truncate text-[0.8125rem] text-ink-muted">
                    {t("tickets", { count: o.tickets })}, {o.event}
                  </span>
                </span>
                <span className="grid justify-items-end">
                  {money ? (
                    <span className="text-[0.875rem] tabular-nums">
                      {o.totalMinor === 0
                        ? t("free")
                        : formatMoney(o.totalMinor, o.currency, locale)}
                    </span>
                  ) : null}
                  <span className="text-[0.8125rem] text-ink-muted">
                    {ago(o.paidAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const TodoIcon = ({ kind }: { kind: "stripe" | "cover" | "draft" }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="size-4 shrink-0 text-warning"
  >
    {kind === "stripe" ? (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
      </>
    ) : kind === "cover" ? (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="2" />
        <path d="m21 16-5-5-9 9" />
      </>
    ) : (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5l3 2" />
      </>
    )}
  </svg>
);

/** Ce qu'il reste à faire : Stripe, les images manquantes, les brouillons oubliés. */
export async function TodoList({
  todo,
  base,
  canPay,
}: {
  todo: Home["todo"];
  base: string;
  canPay: boolean;
}) {
  const t = await getTranslations("dashboard");
  const items = [
    ...(todo.stripe && canPay
      ? [
          {
            href: `${base}/settings/payments`,
            label: t("todoStripe"),
            kind: "stripe" as const,
          },
        ]
      : []),
    ...(todo.noCover
      ? [
          {
            href: `${base}/events`,
            label: t("todoCover", { count: todo.noCover }),
            kind: "cover" as const,
          },
        ]
      : []),
    ...(todo.drafts
      ? [
          {
            href: `${base}/events`,
            label: t("todoDrafts", { count: todo.drafts }),
            kind: "draft" as const,
          },
        ]
      : []),
  ];
  return (
    <section aria-labelledby="todo" className="grid content-start gap-1.5">
      <h2 id="todo" className={sectionTitle}>
        {t("todoTitle")}
      </h2>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 border-t border-line py-3 text-[0.875rem] text-success">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <path d="m5 12 5 5 9-10" />
          </svg>
          {t("todoNone")}
        </p>
      ) : (
        <ul role="list" className="grid">
          {items.map((i) => (
            <li key={i.label} className="border-b border-line first:border-t">
              <Link
                href={i.href}
                className="flex items-center gap-2.5 py-2.5 text-[0.875rem] hover:bg-surface-sunken/50"
              >
                <TodoIcon kind={i.kind} />
                <span className="min-w-0 flex-1">{i.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
