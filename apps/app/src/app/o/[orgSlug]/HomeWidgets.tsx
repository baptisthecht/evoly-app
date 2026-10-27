import { formatDateTime, formatMoney, type Locale } from "@evoly/i18n";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { Badge, Card } from "@/components/ui/Card";
import type { homeOverview } from "@/server/home";

type Home = Awaited<ReturnType<typeof homeOverview>>;
const dayOf = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
const Gauge = ({
  sold,
  capacity,
}: {
  sold: number;
  capacity: number | null;
}) =>
  capacity ? (
    <span
      aria-hidden="true"
      className="block h-2 overflow-hidden rounded-full bg-surface-sunken"
    >
      <span
        className="block h-2 rounded-full bg-[var(--accent)]"
        style={{ width: `${Math.min(100, (sold / capacity) * 100)}%` }}
      />
    </span>
  ) : null;
const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** Le prochain événement : son image, un compte à rebours, la jauge de ses ventes. */
export async function NextEventWidget({
  next,
  base,
  locale,
}: {
  next: Home["next"];
  base: string;
  locale: Locale;
}) {
  const t = await getTranslations("dashboard");
  if (!next) return null;
  const days = Math.round(
    (Date.parse(dayOf(next.startsAt, next.timezone)) -
      Date.parse(dayOf(new Date(), next.timezone))) /
      86_400_000,
  );
  const when =
    days <= 0
      ? t("nextToday")
      : days === 1
        ? t("nextTomorrow")
        : t("nextIn", { count: days });
  return (
    <Card className="grid overflow-hidden p-0 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="relative h-44 bg-[var(--accent)] md:h-full md:min-h-56">
        {next.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={next.coverImageUrl}
            alt=""
            className="absolute inset-0 size-full object-cover"
          />
        ) : (
          <span aria-hidden="true" className="absolute inset-0 overflow-hidden">
            <span className="absolute -top-10 -left-8 size-40 rounded-full bg-[var(--accent-panel,var(--evoly-lilas))]" />
            <span className="absolute top-10 right-6 size-28 rotate-12 rounded-[30%] bg-surface-inverse" />
          </span>
        )}
      </div>
      <div className="grid content-start gap-3 p-5">
        <p className="inline-flex items-center gap-2 justify-self-start rounded-full bg-surface-inverse px-3.5 py-1.5 text-sm font-semibold text-ink-inverse">
          {days <= 1 ? (
            <span aria-hidden="true" className="relative inline-flex size-2">
              <span className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)] motion-reduce:animate-none" />
              <span className="relative size-2 rounded-full bg-[var(--accent)]" />
            </span>
          ) : null}
          {when}
        </p>
        <h2 className="font-display text-2xl leading-tight tracking-[var(--tracking-title)]">
          {next.title}
        </h2>
        <p className="text-sm text-ink-muted">
          {formatDateTime(next.startsAt, next.timezone, locale, "long")}
          {next.place ? (
            <>
              <br />
              {next.place}
            </>
          ) : null}
        </p>
        <div className="grid gap-1.5">
          <p className="flex items-baseline justify-between text-sm">
            <span className="font-semibold">{t("nextSold")}</span>
            <span className="tabular-nums">
              {next.capacity ? `${next.sold} / ${next.capacity}` : next.sold}
            </span>
          </p>
          <Gauge sold={next.sold} capacity={next.capacity} />
        </div>
        <ButtonLink
          href={`${base}/events/${next.id}`}
          variant="dark"
          className="mt-1 justify-self-start"
        >
          {t("viewEvent")}
        </ButtonLink>
      </div>
    </Card>
  );
}

/** Les dernières commandes, sous une pastille « En direct ». */
export async function LiveOrdersWidget({
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
    <Card className="grid content-start gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg tracking-[var(--tracking-title)]">
          {t("liveTitle")}
        </h2>
        <Badge tone="accent" live>
          {t("live")}
        </Badge>
      </div>
      {recent.length === 0 ? (
        <p className="text-sm text-ink-muted">{t("liveEmpty")}</p>
      ) : null}
      <ul role="list" className="grid gap-1">
        {recent.map((o) => (
          <li key={o.id}>
            <Link
              href={`${base}/orders/${o.id}`}
              className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-sunken"
            >
              <span
                aria-hidden="true"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--evoly-lilas)] font-display text-sm text-[var(--evoly-charbon)]"
              >
                {initials(o.name)}
              </span>
              <span className="grid min-w-0 flex-1">
                <span className="truncate text-sm font-semibold">{o.name}</span>
                <span className="truncate text-xs text-ink-muted">
                  {o.event}
                </span>
              </span>
              <span className="grid justify-items-end">
                {money ? (
                  <span className="text-sm font-semibold tabular-nums">
                    {o.totalMinor === 0
                      ? t("free")
                      : formatMoney(o.totalMinor, o.currency, locale)}
                  </span>
                ) : null}
                <span className="text-xs text-ink-muted">{ago(o.paidAt)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** La recette des 30 derniers jours, jour par jour. */
export async function RevenueWidget({
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
  const total = revenue.reduce((n, d) => n + d.totalMinor, 0);
  const W = 300;
  const H = 80;
  const bw = W / revenue.length;
  return (
    <Card className="grid content-start gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg tracking-[var(--tracking-title)]">
          {t("revenueTitle")}
        </h2>
        <p className="font-display text-xl tabular-nums">
          {formatMoney(total, currency, locale)}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-24 w-full"
        role="img"
        aria-label={t("revenueLabel", {
          total: formatMoney(total, currency, locale),
        })}
        preserveAspectRatio="none"
      >
        {revenue.map((d, i) => {
          const h = d.totalMinor
            ? Math.max(3, (d.totalMinor / max) * (H - 4))
            : 2;
          return (
            <rect
              key={d.day}
              x={i * bw + 1.5}
              y={H - h}
              width={bw - 3}
              height={h}
              rx={2}
              fill={
                i === revenue.length - 1
                  ? "var(--evoly-charbon)"
                  : d.totalMinor
                    ? "var(--accent)"
                    : "var(--line)"
              }
            >
              <title>{`${d.day} : ${formatMoney(d.totalMinor, currency, locale)}`}</title>
            </rect>
          );
        })}
      </svg>
    </Card>
  );
}

/** Le remplissage des événements à venir. */
export async function FillWidget({
  fill,
  base,
  locale,
}: {
  fill: Home["fill"];
  base: string;
  locale: Locale;
}) {
  const t = await getTranslations("dashboard");
  if (fill.length === 0) return null;
  return (
    <Card className="grid content-start gap-3">
      <h2 className="font-display text-lg tracking-[var(--tracking-title)]">
        {t("fillTitle")}
      </h2>
      <ul role="list" className="grid gap-3">
        {fill.map((e) => (
          <li key={e.id}>
            <Link
              href={`${base}/events/${e.id}`}
              className="grid gap-1.5 rounded-lg px-2 py-1.5 hover:bg-surface-sunken"
            >
              <span className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-semibold">{e.title}</span>
                <span className="shrink-0 tabular-nums text-ink-muted">
                  {e.capacity
                    ? `${Math.round((e.sold / e.capacity) * 100)} %`
                    : e.sold}
                </span>
              </span>
              <Gauge sold={e.sold} capacity={e.capacity} />
              <span className="text-xs text-ink-muted">
                {formatDateTime(e.startsAt, e.timezone, locale, "short")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Ce qu'il reste à faire : Stripe, les images manquantes, les brouillons oubliés. */
export async function TodoWidget({
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
            tone: "warning" as const,
          },
        ]
      : []),
    ...(todo.noCover
      ? [
          {
            href: `${base}/events`,
            label: t("todoCover", { count: todo.noCover }),
            tone: "info" as const,
          },
        ]
      : []),
    ...(todo.drafts
      ? [
          {
            href: `${base}/events`,
            label: t("todoDrafts", { count: todo.drafts }),
            tone: "neutral" as const,
          },
        ]
      : []),
  ];
  return (
    <Card className="grid content-start gap-3">
      <h2 className="font-display text-lg tracking-[var(--tracking-title)]">
        {t("todoTitle")}
      </h2>
      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm">
          <Badge tone="success" dot>
            {t("todoNone")}
          </Badge>
        </p>
      ) : (
        <ul role="list" className="grid gap-1">
          {items.map((i) => (
            <li key={i.label}>
              <Link
                href={i.href}
                className="flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface-sunken"
              >
                <span className="flex items-center gap-2.5">
                  <Badge tone={i.tone} dot>
                    {" "}
                  </Badge>
                  {i.label}
                </span>
                <span aria-hidden="true" className="text-ink-subtle">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
