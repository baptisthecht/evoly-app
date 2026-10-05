import { effectiveEnd } from "@evoly/core";
import type { Metadata } from "next";
import { formatDateTime, formatMoney, type Locale } from "@evoly/i18n";
import { eventOgImageUrl } from "@/server/seo";
import { canonicalEventUrl, canonicalOrgUrl } from "@/server/canonical";
import type { PublicEventData, PublicOrganization } from "@/server/publicEvents";
import { EventPublicView } from "./EventPublicView";
import { PublicShell } from "./PublicShell";
import { AccessGate } from "./AccessGate";
import { getLocale, getTranslations } from "next-intl/server";
import { cache } from "react";
import { db } from "@/lib/db";
import { hasEventAccess } from "@/server/questions";
import { publicSeatMap } from "@/server/seating";

/** Section 9.9 : plan des places à choisir, si l'organisateur le permet (disponibilités lues en direct). */
function seatMapFor(event: { id: string; seatingMode: string; allowSeatChoice: boolean }) {
  // le mode vient de l'événement déjà chargé : pas de requête de plus
  // placement numéroté : le plan sert à voir ses places, et à les changer si l'organisateur le permet
  return event.seatingMode === "ASSIGNED" ? publicSeatMap(event.id, event.allowSeatChoice) : null;
}

const eventUnlocked = cache(async (eventId: string) => {
  const ev = await db.event.findUnique({ where: { id: eventId }, select: { id: true, visibility: true, accessCodeHash: true } });
  return !!ev && (await hasEventAccess(ev));
});

/** Métadonnées d'une page d'événement : adresse canonique (RG-DOM-06), indexation selon la visibilité. */
export async function eventMetadata(org: PublicOrganization, data: PublicEventData): Promise<Metadata> {
  const e = data.event;
  // événement privé verrouillé : rien de son contenu dans les aperçus de liens
  const orgName = org.brand?.displayName ?? org.name;
  if (!(await eventUnlocked(e.id))) {
    const title = `${(await getTranslations("public"))("privateTitle")} - ${orgName}`;
    return { title: { absolute: title }, robots: { index: false, follow: false }, openGraph: { type: "website", title, siteName: orgName }, twitter: { card: "summary", title } };
  }
  const t = await getTranslations("public");
  const locale = (await getLocale()) as Locale;
  const url = await canonicalEventUrl(org, e);
  const indexable = e.visibility === "PUBLIC";
  // titre : quoi, quand, où (ce que l'on cherche et ce qui donne envie de cliquer) ; description composée à défaut de résumé
  const date = formatDateTime(e.startsAt, e.timezone, locale, "short");
  const place = [e.locationName, e.city].filter(Boolean).join(", ");
  const min = data.ticketTypes.length ? Math.min(...data.ticketTypes.map((tt) => tt.priceMinor)) : null;
  const price = min === null ? "" : min === 0 ? t("seoFree") : t("seoFrom", { price: formatMoney(min, e.currency, locale, { trimZeroCents: true }) });
  const title = t("seoTitle", { title: e.title, date, city: e.city ?? "", org: orgName });
  const description = (e.summary?.trim() ? `${e.summary.trim()} ` : "") + t("seoDescription", { title: e.title, date, place: place || "-", price, org: orgName });
  const image = e.coverImageUrl ? { url: e.coverImageUrl, alt: e.title } : { url: eventOgImageUrl(e.id, e.updatedAt), width: 1200, height: 630, alt: e.title };
  return {
    title: { absolute: title },
    description: description.slice(0, 300),
    alternates: { canonical: url },
    robots: { index: indexable, follow: indexable, "max-image-preview": "large", "max-snippet": -1 },
    icons: org.brand?.faviconUrl ? { icon: org.brand.faviconUrl } : undefined,
    openGraph: { type: "website", url, siteName: orgName, locale: locale === "en" ? "en_GB" : "fr_FR", title: e.title, description: description.slice(0, 300), images: [image] },
    twitter: { card: "summary_large_image", title: e.title, description: description.slice(0, 200), images: [image] },
  };
}

/** Page de vente d'un événement, avec ses données structurées schema.org/Event. */
export async function PublicEventPage({ org, data, homeHref }: { org: PublicOrganization; data: PublicEventData; homeHref: string }) {
  const e = data.event;
  if (!(await eventUnlocked(e.id)))
    return (
      <PublicShell org={org} homeHref={homeHref}>
        <AccessGate eventId={e.id} />
      </PublicShell>
    );
  const [url, orgUrl] = await Promise.all([canonicalEventUrl(org, e), canonicalOrgUrl(org)]);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    description: e.summary ?? undefined,
    startDate: e.startsAt.toISOString(),
    endDate: effectiveEnd(e.startsAt, e.endsAt).toISOString(),
    eventStatus: e.status === "CANCELLED" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: { PHYSICAL: "https://schema.org/OfflineEventAttendanceMode", ONLINE: "https://schema.org/OnlineEventAttendanceMode", HYBRID: "https://schema.org/MixedEventAttendanceMode" }[e.locationType],
    location:
      e.locationType === "ONLINE"
        ? { "@type": "VirtualLocation", url }
        : { "@type": "Place", name: e.locationName ?? e.city ?? undefined, address: { "@type": "PostalAddress", streetAddress: e.addressLine1 ?? undefined, postalCode: e.postalCode ?? undefined, addressLocality: e.city ?? undefined, addressCountry: e.country ?? undefined } },
    image: [e.coverImageUrl ?? eventOgImageUrl(e.id, e.updatedAt)],
    organizer: { "@type": "Organization", name: org.brand?.displayName ?? org.name, url: orgUrl },
    offers: data.ticketTypes.map((tt) => ({ "@type": "Offer", name: tt.name, price: (tt.priceMinor / 100).toFixed(2), priceCurrency: e.currency, ...(e.salesStartAt ? { validFrom: e.salesStartAt.toISOString() } : {}), availability: tt.remaining > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut", url })),
  };
  return (
    <PublicShell org={org} homeHref={homeHref}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <EventPublicView org={org} data={data} seatMap={await seatMapFor(e)} />
    </PublicShell>
  );
}
