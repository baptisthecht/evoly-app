import { effectiveEnd } from "@evoly/core";
import type { Metadata } from "next";
import { canonicalEventUrl, canonicalOrgUrl } from "@/server/canonical";
import type { PublicEventData, PublicOrganization } from "@/server/publicEvents";
import { EventPublicView } from "./EventPublicView";
import { PublicShell } from "./PublicShell";
import { AccessGate } from "./AccessGate";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { db } from "@/lib/db";
import { hasEventAccess } from "@/server/questions";
import { publicSeatMap } from "@/server/seating";

/** Section 9.9 : plan des places à choisir, si l'organisateur le permet (disponibilités lues en direct). */
function seatMapFor(event: { id: string; seatingMode: string; allowSeatChoice: boolean }) {
  // le mode vient de l'événement déjà chargé : pas de requête de plus
  return event.seatingMode === "ASSIGNED" && event.allowSeatChoice ? publicSeatMap(event.id) : null;
}

const eventUnlocked = cache(async (eventId: string) => {
  const ev = await db.event.findUnique({ where: { id: eventId }, select: { id: true, visibility: true, accessCodeHash: true } });
  return !!ev && (await hasEventAccess(ev));
});

/** Métadonnées d'une page d'événement : adresse canonique (RG-DOM-06), indexation selon la visibilité. */
export async function eventMetadata(org: PublicOrganization, data: PublicEventData): Promise<Metadata> {
  const e = data.event;
  // événement privé verrouillé : rien de son contenu dans les aperçus de liens
  if (!(await eventUnlocked(e.id))) return { title: { absolute: `${(await getTranslations("public"))("privateTitle")} — ${org.brand?.displayName ?? org.name}` }, robots: { index: false, follow: false } };
  const url = await canonicalEventUrl(org, e);
  const indexable = e.visibility === "PUBLIC";
  return {
    title: { absolute: `${e.title} — ${org.brand?.displayName ?? org.name}` },
    description: e.summary ?? undefined,
    alternates: { canonical: url },
    robots: { index: indexable, follow: indexable },
    icons: org.brand?.faviconUrl ? { icon: org.brand.faviconUrl } : undefined,
    openGraph: { type: "website", url, title: e.title, description: e.summary ?? undefined, images: e.coverImageUrl ? [e.coverImageUrl] : undefined },
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
    image: e.coverImageUrl ? [e.coverImageUrl] : undefined,
    organizer: { "@type": "Organization", name: org.brand?.displayName ?? org.name, url: orgUrl },
    offers: data.ticketTypes.map((tt) => ({ "@type": "Offer", name: tt.name, price: (tt.priceMinor / 100).toFixed(2), priceCurrency: e.currency, availability: tt.remaining > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut", url })),
  };
  return (
    <PublicShell org={org} homeHref={homeHref}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <EventPublicView org={org} data={data} seatMap={await seatMapFor(e)} />
    </PublicShell>
  );
}
