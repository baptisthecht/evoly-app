import { formatMoney, formatTime, type Locale } from "@evoly/i18n";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CopyLinkButton } from "@/components/shell/CopyLinkButton";
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
import { EventsTable } from "@/components/events/EventsTable";
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
      className="h-[52px] w-[280px] max-w-full"
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
              i === revenue.length - 1
                ? "var(--ink-strong)"
                : "var(--control-off)"
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
  money,
}: {
  next: NonNullable<Home["next"]>;
  url: string;
  base: string;
  locale: Locale;
  money: boolean;
}) {
  const [t, tp] = await Promise.all([
    getTranslations("dashboard"),
    getTranslations("pace"),
  ]);
  const days = daysUntil(next.startsAt, next.timezone);
  const big =
    days <= 0
      ? t("countdownToday")
      : days === 1
        ? t("countdownTomorrow")
        : t("countdown", { count: days });
  const date = new Intl.DateTimeFormat(locale, {
    timeZone: next.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(next.startsAt);
  const doors = formatTime(
    next.doorsOpenAt ?? next.startsAt,
    next.timezone,
    locale,
  );
  const word =
    next.pace.pace === "unknown" || next.pace.pace === "notStarted"
      ? null
      : tp(next.pace.pace);
  const tone =
    next.pace.pace === "ahead" || next.pace.pace === "soldOut"
      ? "text-success"
      : next.pace.pace === "behind"
        ? "text-warning"
        : "text-ink-muted";
  const cash = next.free
    ? t("free")
    : formatMoney(next.collectedMinor, next.currency, locale);
  return (
    <HighlightBand
      aria-labelledby="next-event"
      className="md:grid-cols-[minmax(0,1.3fr)_auto_minmax(0,1.2fr)]"
    >
      <div className="min-w-0">
        <BandKicker>{t("nextLabel")}</BandKicker>
        <BandTitle>
          <Link
            id="next-event"
            href={`${base}/events/${next.id}`}
            className="hover:underline"
          >
            {next.title}
          </Link>
        </BandTitle>
        <BandText>
          {t("nextWhen", { date, time: doors })}
          {next.place ? `, ${next.place}` : null}
        </BandText>
      </div>
      <BandCountdown value={big} caption={days > 1 ? t("beforeDoors") : null} />
      <div>
        {next.capacity != null ? (
          <>
            <p className="mb-[5px] flex justify-between gap-3 text-[13px] tabular-nums">
              <span>
                <b className="font-semibold">
                  {tp("soldOf", { sold: next.sold, capacity: next.capacity })}
                </b>
                {money ? `, ${cash}` : null}
              </span>
              {word ? (
                <span className={`text-[12.5px] ${tone}`}>{word}</span>
              ) : null}
            </p>
            <Gauge
              ratio={next.pace.soldRatio ?? 0}
              tone={
                next.pace.pace === "soldOut"
                  ? "success"
                  : next.pace.pace === "behind"
                    ? "warning"
                    : "ink"
              }
              marker={
                next.pace.elapsedRatio != null &&
                next.pace.pace !== "soldOut" &&
                next.pace.pace !== "notStarted"
                  ? next.pace.elapsedRatio
                  : null
              }
              label={tp("label", {
                sold: next.sold,
                capacity: next.capacity,
                pace: word ?? "",
              })}
            />
          </>
        ) : (
          <p className="text-[13px] tabular-nums">
            <b className="font-semibold">{tp("sold", { sold: next.sold })}</b>
            {money ? `, ${cash}` : null}
          </p>
        )}
        <div className="mt-2.5 flex flex-wrap gap-2">
          <CopyLinkButton url={url} />
          <Link
            href={`${base}/events/${next.id}`}
            className={buttonClass("secondary")}
          >
            {t("open")}
          </Link>
        </div>
      </div>
    </HighlightBand>
  );
}

/** Les événements suivants (refonte A3) : le tableau des événements, sous son titre. */
export async function UpcomingTable({
  events,
  base,
  locale,
  money,
}: {
  events: Home["fill"];
  base: string;
  locale: Locale;
  money: boolean;
}) {
  const t = await getTranslations("dashboard");
  if (events.length === 0) return null;
  return (
    <section aria-labelledby="upcoming">
      <SectionTitle
        id="upcoming"
        title={t("upcomingTitle")}
        link={{ href: `${base}/events`, label: t("allEvents") }}
      />
      <EventsTable
        events={events}
        base={base}
        locale={locale}
        money={money}
        withTime={false}
        salesWidth={280}
      />
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
    <section aria-labelledby="recent-orders" className="min-w-0">
      <SectionTitle
        id="recent-orders"
        title={t("liveTitle")}
        link={{ href: `${base}/orders`, label: t("allOrders") }}
      />
      {recent.length === 0 ? (
        <p className="border-b border-line py-[9px] text-ink-muted">
          {t("liveEmpty")}
        </p>
      ) : (
        <ul role="list">
          {recent.map((o) => (
            <li key={o.id} className="border-b border-line">
              <Link
                href={`${base}/orders/${o.id}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-[9px] hover:bg-surface-hover"
              >
                <span className="min-w-0">
                  <b className="block truncate font-medium">{o.name}</b>
                  <small className="block truncate text-[12.5px] text-ink-muted">
                    {t("tickets", { count: o.tickets })}, {o.event}
                  </small>
                </span>
                <span className="text-right tabular-nums">
                  {money
                    ? o.totalMinor === 0
                      ? t("free")
                      : formatMoney(o.totalMinor, o.currency, locale)
                    : null}
                  <small className="block text-[12.5px] text-ink-muted">
                    {ago(o.paidAt)}
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

const TodoIcon = ({ kind }: { kind: "stripe" | "cover" | "draft" }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
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
            action: t("todoActionStripe"),
            kind: "stripe" as const,
          },
        ]
      : []),
    ...(todo.noCover.length === 1
      ? [
          {
            href: `${base}/events/${todo.noCover[0]!.id}/appearance/images`,
            label: t("todoCoverOne", { title: todo.noCover[0]!.title }),
            action: t("todoActionCover"),
            kind: "cover" as const,
          },
        ]
      : todo.noCover.length > 1
        ? [
            {
              href: `${base}/events`,
              label: t("todoCover", { count: todo.noCover.length }),
              action: t("todoActionCover"),
              kind: "cover" as const,
            },
          ]
        : []),
    ...todo.drafts.map((d) => ({
      href: `${base}/events/${d.id}`,
      label: t("todoDraft", { title: d.title, count: d.days }),
      action: t("todoActionDrafts"),
      kind: "draft" as const,
    })),
  ];
  return (
    <section aria-labelledby="todo" className="min-w-0">
      <SectionTitle id="todo" title={t("todoTitle")} />
      {items.length === 0 ? (
        <p className="flex items-center gap-2.5 border-b border-line py-[9px] text-success">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            className="size-4"
          >
            <path d="m5 12 5 5 9-10" />
          </svg>
          {t("todoNone")}
        </p>
      ) : (
        <ul role="list">
          {items.map((i) => (
            <li
              key={i.label}
              className="flex items-center gap-2.5 border-b border-line py-[9px]"
            >
              <TodoIcon kind={i.kind} />
              <span className="min-w-0 flex-1">{i.label}</span>
              <Link
                href={i.href}
                className="shrink-0 text-[13px] font-medium underline underline-offset-[3px]"
              >
                {i.action}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
