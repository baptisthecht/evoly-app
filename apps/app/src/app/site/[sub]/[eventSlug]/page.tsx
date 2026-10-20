import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DisabledSite } from "@/components/public/DisabledSite";
import { EventRouteView, eventRouteMetadata, loadEventForVisitor } from "@/components/public/Prepublished";
import { resolveSite } from "@/server/publicEvents";
import { siteGate } from "@/server/siteGuard";
import { ViewBeacon } from "@/components/public/ViewBeacon";
import { themeForEvent } from "@/server/brand";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sub: string; eventSlug: string }>; searchParams: Promise<{ apercu?: string; prevente?: string; attente?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { sub, eventSlug } = await params;
  const site = await resolveSite(sub);
  if (site?.kind !== "ORG" && site?.kind !== "EVENT") return {};
  const data = await loadEventForVisitor(site.org, { organizationId: site.org.id, slug: eventSlug });
  return data ? eventRouteMetadata(site.org, data, await searchParams) : {};
}

export default async function PublicEventRoute({ params, searchParams }: Props) {
  const { sub, eventSlug } = await params;
  const site = await siteGate(sub, `/${eventSlug}`);
  if (site.kind === "DISABLED") return <DisabledSite fallback={site.fallback} />;
  const data = await loadEventForVisitor(site.org, { organizationId: site.org.id, slug: eventSlug });
  if (!data) notFound();
  const eventId = "event" in data && data.event ? (data.event as { id: string }).id : null;
  // style propre à l'événement (Pro) : chaque réglage remplace celui de la marque
  const eventTheme = "event" in data && data.event ? (data.event as Parameters<typeof themeForEvent>[1]) : null;
  const org = site.org.brand && eventTheme ? { ...site.org, brand: themeForEvent(site.org.brand, eventTheme) } : site.org;
  return (
    <>
      {eventId ? <ViewBeacon eventId={eventId} /> : null}
      <EventRouteView org={org} data={data} homeHref="/" query={await searchParams} />
    </>
  );
}
