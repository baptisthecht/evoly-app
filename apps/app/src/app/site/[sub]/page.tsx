import { formatDateTime, formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { orgOgImageUrl } from "@/server/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/public/PublicShell";
import { DisabledSite } from "@/components/public/DisabledSite";
import { PublicEventPage, eventMetadata } from "@/components/public/EventPage";
import {
  EventRouteView,
  eventRouteMetadata,
  loadEventForVisitor,
} from "@/components/public/Prepublished";
import { canonicalOrgUrl } from "@/server/canonical";
import {
  listPublicEvents,
  loadPublicEvent,
  featuredOf,
  publicEventCards,
  resolveSite,
} from "@/server/publicEvents";
import { siteGate } from "@/server/siteGuard";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ sub: string }>;
  searchParams: Promise<{ apercu?: string; prevente?: string }>;
};

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const { sub } = await params;
  const site = await resolveSite(sub);
  if (site?.kind === "EVENT") {
    const data = await loadEventForVisitor(site.org, { id: site.eventId });
    return data ? eventRouteMetadata(site.org, data, await searchParams) : {};
  }
  if (site?.kind !== "ORG") return {};
  const name = site.org.brand?.displayName ?? site.org.name;
  const tp = await getTranslations("public");
  const description = tp("seoOrgDescription", { org: name });
  const image = {
    url: orgOgImageUrl(site.org.id),
    width: 1200,
    height: 630,
    alt: name,
  };
  return {
    title: { absolute: tp("seoOrgTitle", { org: name }) },
    description,
    openGraph: {
      type: "website",
      siteName: name,
      title: name,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: name,
      description,
      images: [image],
    },
    alternates: { canonical: await canonicalOrgUrl(site.org) },
    robots: { index: true, follow: true },
    icons: site.org.brand?.faviconUrl
      ? { icon: site.org.brand.faviconUrl }
      : undefined,
  };
}

/** RG-PUB-07 : la page de l'organisation liste ses événements publics à venir, puis passés. */
export default async function OrganizationPublicPage({
  params,
  searchParams,
}: Props) {
  const { sub } = await params;
  const site = await siteGate(sub, "/");
  if (site.kind === "DISABLED")
    return <DisabledSite fallback={site.fallback} />;
  if (site.kind === "EVENT") {
    // hôte dédié à un événement (sous-domaine d'événement ou domaine personnalisé) : la page de l'événement
    const data = await loadEventForVisitor(site.org, { id: site.eventId });
    if (!data) notFound();
    return (
      <EventRouteView
        org={site.org}
        data={data}
        homeHref={await canonicalOrgUrl(site.org)}
        query={await searchParams}
      />
    );
  }
  const org = site.org;
  const { upcoming, past } = await listPublicEvents(org.id);
  const t = await getTranslations("public");
  const locale = (await getLocale()) as Locale;
  const cards = await publicEventCards(upcoming);
  const name = org.brand?.displayName ?? org.name;
  const book = org.brand?.buttonLabel ?? t("orgBook");
  const socials = Object.entries(
    (org.brand?.socialLinks ?? {}) as Record<string, string | undefined>,
  ).filter(
    (entry): entry is [string, string] =>
      typeof entry[1] === "string" && /^https:\/\//.test(entry[1]),
  );
  const place = (e: (typeof upcoming)[number]) =>
    e.locationType === "ONLINE"
      ? t("online")
      : (e.city ?? e.locationName ?? "");
  const time = (e: (typeof upcoming)[number]) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: e.timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(e.startsAt);
  const stamp = (e: (typeof upcoming)[number]) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: e.timezone,
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(e.startsAt);
  const dayOf = (d: Date, tz: string) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  /** Pastille de la carte mise en avant : le jour même et la veille, avec un point qui pulse. */
  const when = (e: (typeof upcoming)[number]) => {
    const days = Math.round(
      (Date.parse(dayOf(e.startsAt, e.timezone)) -
        Date.parse(dayOf(new Date(), e.timezone))) /
        86_400_000,
    );
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: e.timezone,
        hour: "2-digit",
        hourCycle: "h23",
      }).format(e.startsAt),
    );
    if (days <= 0)
      return {
        label:
          hour >= 17
            ? t("orgTonight", { time: time(e) })
            : t("orgToday", { time: time(e) }),
        live: true,
      };
    if (days === 1)
      return { label: t("orgTomorrow", { time: time(e) }), live: true };
    if (days <= 30)
      return { label: t("orgInDays", { count: days }), live: false };
    return {
      label: formatDateTime(e.startsAt, e.timezone, locale, "short"),
      live: false,
    };
  };
  const price = (id: string) => {
    const c = cards.get(id);
    if (!c || c.fromPriceMinor == null) return null;
    return c.fromPriceMinor === 0
      ? t("orgFree")
      : t("orgFrom", {
          price: formatMoney(c.fromPriceMinor, c.currency, locale),
        });
  };
  const left = (id: string) => {
    const c = cards.get(id);
    if (!c) return null;
    if (c.soldOut) return { label: t("orgSoldOut"), full: true };
    if (c.remaining != null && c.remaining <= 20)
      return { label: t("orgFewLeft", { count: c.remaining }), full: false };
    return null;
  };
  // affiche dessinée aux couleurs de la marque, quand l'événement n'a pas d'image de couverture :
  // l'une de trois compositions, fixée par le titre (toujours la même pour un même événement)
  const LOOKS = [
    {
      bg: "bg-[var(--accent)]",
      ink: "text-[var(--accent-ink)]",
      a: "-top-[12%] -left-[18%] size-[78%] rounded-full bg-[var(--accent-panel)]",
      b: "top-[22%] left-[55%] size-[52%] rotate-[18deg] rounded-[22%] bg-surface-inverse",
      c: "top-[52%] left-[8%] size-[22%] rounded-full bg-surface",
    },
    {
      bg: "bg-surface-inverse",
      ink: "text-ink-inverse",
      a: "-top-[20%] left-[30%] size-[90%] rounded-full bg-[var(--accent)]",
      b: "top-[38%] -left-[10%] size-[40%] rounded-full bg-[var(--accent-panel)]",
      c: "top-[12%] left-[10%] size-[16%] rotate-45 rounded-[20%] bg-surface",
    },
    {
      bg: "bg-[var(--accent-panel)]",
      ink: "text-[var(--accent-ink)]",
      a: "top-[8%] left-[8%] size-[56%] rotate-[-12deg] rounded-[28%] bg-[var(--accent)]",
      b: "-top-[10%] -right-[12%] size-[46%] rounded-full bg-surface-inverse",
      c: "top-[46%] left-[58%] size-[26%] rounded-full bg-surface",
    },
  ];
  const lookOf = (title: string) =>
    LOOKS[
      [...title].reduce((n, ch) => n + ch.charCodeAt(0), 0) % LOOKS.length
    ]!;
  const cover = (
    e: { title: string; coverImageUrl: string | null },
    big = false,
  ) => {
    if (e.coverImageUrl)
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={e.coverImageUrl}
          alt=""
          loading={big ? "eager" : "lazy"}
          className="absolute inset-0 size-full object-cover"
        />
      );
    const look = lookOf(e.title);
    const long = e.title.length > 14;
    const size = big
      ? long
        ? "text-[clamp(1.9rem,7vw,3.2rem)]"
        : "text-[clamp(2.4rem,9vw,4rem)]"
      : long
        ? "text-lg"
        : "text-2xl";
    return (
      <span
        aria-hidden="true"
        className={`absolute inset-0 overflow-hidden ${look.bg}`}
      >
        <span className={`absolute ${look.a}`} />
        <span className={`absolute ${look.b}`} />
        <span className={`absolute ${look.c}`} />
        <span
          lang={locale}
          className={`absolute inset-x-[8%] bottom-[9%] font-display leading-[0.95] tracking-[-0.03em] break-normal hyphens-none text-balance uppercase ${look.ink} ${size}`}
        >
          {e.title}
        </span>
      </span>
    );
  };
  const { featured, rest } = featuredOf(
    org.featuredMode,
    org.featuredEventId,
    upcoming,
  );

  return (
    <PublicShell org={org} homeHref="/">
      <div className="mx-auto grid max-w-6xl pb-16">
        <div
          aria-hidden="true"
          className="relative h-36 overflow-hidden bg-[var(--accent)] sm:mx-8 sm:h-48 sm:rounded-[2rem]"
        >
          <span className="absolute -top-16 -left-10 size-52 rounded-full bg-[var(--accent-panel)]" />
          <span className="absolute top-8 -right-8 size-40 rotate-[20deg] rounded-[30%] bg-surface-inverse" />
          <span className="absolute top-16 left-[40%] size-[4.5rem] rounded-full bg-surface" />
        </div>
        <header className="relative grid gap-2 px-5 pb-6 sm:px-12">
          {org.brand?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={org.brand.logoUrl}
              alt=""
              className="-mt-11 size-[5.25rem] rounded-full border-4 border-[var(--page-bg,var(--surface))] bg-surface object-cover"
            />
          ) : (
            <span
              aria-hidden="true"
              className="-mt-11 inline-flex size-[5.25rem] items-center justify-center rounded-full border-4 border-surface bg-surface-inverse font-display text-3xl text-[var(--accent)]"
            >
              {name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <h1 className="font-display text-[clamp(1.9rem,6vw,3.2rem)] leading-[0.98] tracking-[-0.04em]">
            {name}
          </h1>
          {org.description ? (
            <p className="max-w-2xl text-pretty">{org.description}</p>
          ) : null}
          <p className="text-ink-muted">
            {t("orgUpcomingCount", { count: upcoming.length })}
          </p>
          {socials.length ? (
            <ul className="flex flex-wrap gap-2 pt-1">
              {socials.map(([network, url]) => (
                <li key={network}>
                  <a
                    href={url}
                    rel="noopener me"
                    target="_blank"
                    className="inline-flex min-h-10 items-center rounded-full px-4 text-sm font-semibold ring-1 ring-line"
                  >
                    {t(`orgSocial_${network}`)}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </header>

        {featured ? (
          <section aria-labelledby="featured" className="px-3 sm:px-8">
            <article className="overflow-hidden rounded-[1.9rem] bg-surface-raised ring-1 ring-line sm:grid sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
              <Link
                href={`/${featured.slug}`}
                tabIndex={-1}
                aria-hidden="true"
                className="relative block h-[21rem] sm:h-full sm:min-h-[26rem]"
              >
                {cover(featured, true)}
              </Link>
              <div className="relative grid content-start gap-3 p-5 sm:p-8">
                {(() => {
                  const w = when(featured);
                  return (
                    <p className="inline-flex items-center gap-2.5 justify-self-start rounded-full bg-surface-inverse px-4 py-2 font-label text-sm font-bold text-ink-inverse">
                      {w.live ? (
                        <span
                          aria-hidden="true"
                          className="relative inline-flex size-2.5"
                        >
                          <span className="absolute inset-0 animate-ping rounded-full bg-[var(--accent)] motion-reduce:animate-none" />
                          <span className="relative size-2.5 rounded-full bg-[var(--accent)]" />
                        </span>
                      ) : null}
                      {w.label}
                    </p>
                  );
                })()}
                <h2
                  id="featured"
                  className="font-display text-[clamp(1.6rem,4vw,2.4rem)] leading-[1.02] tracking-[-0.03em]"
                >
                  <Link href={`/${featured.slug}`}>{featured.title}</Link>
                </h2>
                <p className="text-ink-muted">
                  {formatDateTime(
                    featured.startsAt,
                    featured.timezone,
                    locale,
                    "long",
                  )}
                  {place(featured) ? (
                    <>
                      <br />
                      {place(featured)}
                    </>
                  ) : null}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  {price(featured.id) ? (
                    <span className="font-label text-lg font-bold">
                      {price(featured.id)}
                    </span>
                  ) : (
                    <span />
                  )}
                  {left(featured.id) ? (
                    <span
                      className={`rounded-full px-3 py-1 text-sm font-semibold ${left(featured.id)!.full ? "bg-surface-inverse text-ink-inverse" : "bg-[var(--accent)] text-[var(--accent-ink)]"}`}
                    >
                      {left(featured.id)!.label}
                    </span>
                  ) : null}
                </div>
                <Link
                  href={`/${featured.slug}`}
                  className="mt-1 inline-flex min-h-[3.4rem] items-center justify-center rounded-full bg-[var(--accent)] px-6 font-label text-base font-bold text-[var(--accent-ink)]"
                >
                  {left(featured.id)?.full ? t("orgSee") : book}
                </Link>
              </div>
            </article>
          </section>
        ) : upcoming.length === 0 ? (
          <p className="px-5 text-ink-muted sm:px-12">{t("noUpcoming")}</p>
        ) : null}

        {rest.length ? (
          <section aria-labelledby="upcoming" className="grid gap-4 pt-10">
            <div className="flex items-baseline justify-between px-5 sm:px-12">
              <h2
                id="upcoming"
                className="font-display text-2xl tracking-[-0.03em]"
              >
                {t("orgOnStage")}
              </h2>
            </div>
            <ul className="flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-5 pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-8 lg:grid-cols-4">
              {rest.map((e) => (
                <li key={e.id} className="w-52 shrink-0 snap-start sm:w-auto">
                  <Link href={`/${e.slug}`} className="grid gap-2.5">
                    <span className="relative block aspect-[3/4] overflow-hidden rounded-[1.4rem] bg-surface-sunken">
                      {cover(e)}
                      <span className="absolute top-3 left-3 rounded-xl bg-surface px-2.5 py-1.5 font-label text-xs font-bold text-ink">
                        {stamp(e)}
                      </span>
                      {left(e.id)?.full ? (
                        <span className="absolute top-3 right-3 rounded-xl bg-surface-inverse px-2.5 py-1.5 text-xs font-semibold text-ink-inverse">
                          {t("orgSoldOut")}
                        </span>
                      ) : null}
                    </span>
                    <span className="grid gap-0.5">
                      <span className="font-label font-bold">{e.title}</span>
                      <span className="text-sm text-ink-muted">
                        {[time(e), price(e.id)].filter(Boolean).join(", ")}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {past.length ? (
          <section
            aria-labelledby="past"
            className="grid gap-4 px-5 pt-10 sm:px-12"
          >
            <h2 id="past" className="font-display text-2xl tracking-[-0.03em]">
              {t("orgPastTitle")}
            </h2>
            <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
              {past.slice(0, 9).map((e) => (
                <li key={e.id}>
                  <Link href={`/${e.slug}`} className="grid gap-1.5">
                    <span className="relative block aspect-[3/4] overflow-hidden rounded-2xl saturate-[.55]">
                      {cover(e)}
                    </span>
                    <span className="text-xs leading-snug">
                      <strong className="font-semibold">{e.title}</strong>
                      <br />
                      <span className="text-ink-muted">
                        {formatDateTime(
                          e.startsAt,
                          e.timezone,
                          locale,
                          "short",
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </PublicShell>
  );
}
