import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DisabledSite } from "@/components/public/DisabledSite";
import { PublicEventPage, eventMetadata } from "@/components/public/EventPage";
import { loadPublicEvent, resolveSite } from "@/server/publicEvents";
import { siteGate } from "@/server/siteGuard";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ sub: string; eventSlug: string }> }): Promise<Metadata> {
  const { sub, eventSlug } = await params;
  const site = await resolveSite(sub);
  if (site?.kind !== "ORG" && site?.kind !== "EVENT") return {};
  const data = await loadPublicEvent({ organizationId: site.org.id, slug: eventSlug });
  return data ? eventMetadata(site.org, data) : {};
}

export default async function PublicEventRoute({ params }: { params: Promise<{ sub: string; eventSlug: string }> }) {
  const { sub, eventSlug } = await params;
  const site = await siteGate(sub, `/${eventSlug}`);
  if (site.kind === "DISABLED") return <DisabledSite fallback={site.fallback} />;
  const data = await loadPublicEvent({ organizationId: site.org.id, slug: eventSlug });
  if (!data) notFound();
  return <PublicEventPage org={site.org} data={data} homeHref="/" />;
}
