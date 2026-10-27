import { can } from "@evoly/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { env } from "@/lib/env";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { EventAppearance } from "../../settings/EventAppearance";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("images") };
}

/** Apparence, images : l'image de couverture de l'événement. */
export default async function ImagesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const e = await getEventWithTickets(ctx, eventId);
  const readOnly =
    !can(ctx.membership, "EVENTS_EDIT") ||
    ctx.readOnly ||
    ["CANCELLED", "ENDED", "ARCHIVED"].includes(e.status);
  const tn = await getTranslations("nav");
  if (readOnly)
    return <p className="text-sm text-ink-muted">{tn("readOnlyPage")}</p>;
  return (
    <EventAppearance
      orgSlug={orgSlug}
      eventId={eventId}
      part="cover"
      cover={e.coverImageUrl}
      subdomain={e.subdomain}
      baseDomain={env().NEXT_PUBLIC_BASE_DOMAIN}
      canSubdomain={false}
      protocol={new URL(env().NEXT_PUBLIC_APP_URL).protocol}
    />
  );
}
