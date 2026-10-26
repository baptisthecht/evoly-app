import { CoreError } from "@evoly/core";
import { db } from "@/lib/db";
import { audit } from "./audit";
import type { OrgContext } from "./context";
import { featuredOf, listPublicEvents } from "./publicEvents";

export type FeaturedMode = "NONE" | "NEXT" | "CHOSEN";

/** Réglage de la vitrine : l'événement mis en avant, et les événements publics à venir à choisir. */
export async function featuredSettings(ctx: OrgContext) {
  const [org, { upcoming }] = await Promise.all([
    db.organization.findUniqueOrThrow({
      where: { id: ctx.organization.id },
      select: { featuredMode: true, featuredEventId: true },
    }),
    listPublicEvents(ctx.organization.id),
  ]);
  const { fallback } = featuredOf(
    org.featuredMode,
    org.featuredEventId,
    upcoming,
  );
  return {
    mode: org.featuredMode,
    eventId: org.featuredEventId,
    fallback,
    events: upcoming.map((e) => ({
      id: e.id,
      title: e.title,
      startsAt: e.startsAt,
      timezone: e.timezone,
    })),
  };
}

/** Enregistre l'événement mis en avant : seulement un événement public à venir de l'organisation. */
export async function saveFeatured(
  ctx: OrgContext,
  input: { mode: FeaturedMode; eventId?: string | null },
) {
  let eventId: string | null = null;
  if (input.mode === "CHOSEN") {
    const { upcoming } = await listPublicEvents(ctx.organization.id);
    const event = upcoming.find((e) => e.id === input.eventId);
    if (!event) throw new CoreError("FEATURED_EVENT_INVALID");
    eventId = event.id;
  }
  await db.organization.update({
    where: { id: ctx.organization.id },
    data: { featuredMode: input.mode, featuredEventId: eventId },
  });
  await audit({
    action: "organization.featured_updated",
    organizationId: ctx.organization.id,
    actorUserId: ctx.user.id,
    targetType: "Organization",
    targetId: ctx.organization.id,
    metadata: { mode: input.mode, eventId },
  });
  return { mode: input.mode, eventId };
}
