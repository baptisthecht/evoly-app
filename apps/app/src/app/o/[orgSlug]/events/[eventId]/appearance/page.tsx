import { can } from "@evoly/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { EventAppearance } from "../settings/EventAppearance";
import { hasFeature } from "@evoly/core";
import { env } from "@/lib/env";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("eventPage") };
}

export default async function EventAppearancePage({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const e = await getEventWithTickets(ctx, eventId);
  const readOnly = !can(ctx.membership, "EVENTS_EDIT") || ctx.readOnly || ["CANCELLED", "ENDED", "ARCHIVED"].includes(e.status);
  const tn = await getTranslations("nav");
  return (
    <div className="max-w-3xl">
      {readOnly ? <p className="text-sm text-ink-muted">{tn("readOnlyPage")}</p> : null}
      {!readOnly ? (
        <EventAppearance
          orgSlug={orgSlug}
          eventId={eventId}
          cover={e.coverImageUrl}
          subdomain={e.subdomain}
          baseDomain={env().NEXT_PUBLIC_BASE_DOMAIN}
          canSubdomain={hasFeature(ctx.features, "EVENT_SUBDOMAINS")}
          protocol={new URL(env().NEXT_PUBLIC_APP_URL).protocol}
        />
      ) : null}
    </div>
  );
}
