import { formatDateTime, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { orgOgImageUrl } from "@/server/seo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { PublicShell } from "@/components/public/PublicShell";
import { DisabledSite } from "@/components/public/DisabledSite";
import { PublicEventPage, eventMetadata } from "@/components/public/EventPage";
import { PrepublishedEvent, prepublishedMetadata } from "@/components/public/Prepublished";
import { canonicalOrgUrl } from "@/server/canonical";
import { listPublicEvents, loadPublicEvent, resolveSite } from "@/server/publicEvents";
import { siteGate } from "@/server/siteGuard";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sub: string }>; searchParams: Promise<{ apercu?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { sub } = await params;
  const site = await resolveSite(sub);
  if (site?.kind === "EVENT") {
    const data = await loadPublicEvent({ id: site.eventId });
    if (!data) return {};
    return data.prepublished ? prepublishedMetadata(site.org, data, (await searchParams).apercu) : eventMetadata(site.org, data);
  }
  if (site?.kind !== "ORG") return {};
  const name = site.org.brand?.displayName ?? site.org.name;
  const tp = await getTranslations("public");
  const description = tp("seoOrgDescription", { org: name });
  const image = { url: orgOgImageUrl(site.org.id), width: 1200, height: 630, alt: name };
  return {
    title: { absolute: tp("seoOrgTitle", { org: name }) },
    description,
    openGraph: { type: "website", siteName: name, title: name, description, images: [image] },
    twitter: { card: "summary_large_image", title: name, description, images: [image] },
    alternates: { canonical: await canonicalOrgUrl(site.org) },
    robots: { index: true, follow: true },
    icons: site.org.brand?.faviconUrl ? { icon: site.org.brand.faviconUrl } : undefined,
  };
}

/** RG-PUB-07 : la page de l'organisation liste ses événements publics à venir, puis passés. */
export default async function OrganizationPublicPage({ params, searchParams }: Props) {
  const { sub } = await params;
  const site = await siteGate(sub, "/");
  if (site.kind === "DISABLED") return <DisabledSite fallback={site.fallback} />;
  if (site.kind === "EVENT") {
    // hôte dédié à un événement (sous-domaine d'événement ou domaine personnalisé) : la page de l'événement
    const data = await loadPublicEvent({ id: site.eventId });
    if (!data) notFound();
    const home = await canonicalOrgUrl(site.org);
    if (data.prepublished) return <PrepublishedEvent org={site.org} data={data} homeHref={home} token={(await searchParams).apercu} />;
    return <PublicEventPage org={site.org} data={data} homeHref={home} />;
  }
  const org = site.org;
  const { upcoming, past } = await listPublicEvents(org.id);
  const t = await getTranslations("public");
  const locale = (await getLocale()) as Locale;
  const card = (e: (typeof upcoming)[number]) => (
    <li key={e.id}>
      <Link href={`/${e.slug}`} className="grid gap-2 rounded-lg bg-surface-raised p-5 ring-1 ring-line transition-shadow hover:shadow-md">
        <p className="font-label text-xs font-bold text-ink-muted">{formatDateTime(e.startsAt, e.timezone, locale, "short")}</p>
        <p className="font-display text-xl tracking-[-0.03em]">{e.title}</p>
        <p className="text-sm text-ink-muted">{e.locationType === "ONLINE" ? t("online") : (e.city ?? e.locationName ?? "")}</p>
      </Link>
    </li>
  );
  return (
    <PublicShell org={org} homeHref="/">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 pt-6 pb-16 sm:px-8">
        <h1 className="font-display text-[clamp(2.2rem,6vw,4rem)] leading-[0.95] tracking-[-0.05em]">{org.brand?.displayName ?? org.name}</h1>
        <section className="grid gap-4" aria-labelledby="upcoming">
          <h2 id="upcoming" className="font-display text-2xl tracking-[-0.03em]">
            {t("upcoming")}
          </h2>
          {upcoming.length ? (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{upcoming.map(card)}</ul>
          ) : (
            <p className="text-ink-muted">{t("noUpcoming")}</p>
          )}
        </section>
        {past.length ? (
          <section className="grid gap-4" aria-labelledby="past">
            <h2 id="past" className="font-display text-2xl tracking-[-0.03em]">
              {t("past")}
            </h2>
            <ul className="grid gap-4 opacity-80 sm:grid-cols-2 lg:grid-cols-3">{past.slice(0, 9).map(card)}</ul>
          </section>
        ) : null}
      </div>
    </PublicShell>
  );
}
