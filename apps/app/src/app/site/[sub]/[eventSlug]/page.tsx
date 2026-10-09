import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DisabledSite } from "@/components/public/DisabledSite";
import { PublicEventPage, eventMetadata } from "@/components/public/EventPage";
import { PrepublishedEvent, prepublishedMetadata } from "@/components/public/Prepublished";
import { loadPublicEvent, resolveSite } from "@/server/publicEvents";
import { siteGate } from "@/server/siteGuard";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ sub: string; eventSlug: string }>; searchParams: Promise<{ apercu?: string }> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { sub, eventSlug } = await params;
  const site = await resolveSite(sub);
  if (site?.kind !== "ORG" && site?.kind !== "EVENT") return {};
  const data = await loadPublicEvent({ organizationId: site.org.id, slug: eventSlug });
  if (!data) return {};
  return data.prepublished ? prepublishedMetadata(site.org, data, (await searchParams).apercu) : eventMetadata(site.org, data);
}

export default async function PublicEventRoute({ params, searchParams }: Props) {
  const { sub, eventSlug } = await params;
  const site = await siteGate(sub, `/${eventSlug}`);
  if (site.kind === "DISABLED") return <DisabledSite fallback={site.fallback} />;
  const data = await loadPublicEvent({ organizationId: site.org.id, slug: eventSlug });
  if (!data) notFound();
  if (data.prepublished) return <PrepublishedEvent org={site.org} data={data} homeHref="/" token={(await searchParams).apercu} />;
  return <PublicEventPage org={site.org} data={data} homeHref="/" />;
}
