import { can } from "@evoly/core";
import { getTranslations } from "next-intl/server";
import { cache } from "react";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";
import { buildEventTabs } from "./eventTabs";

/** Événement de l'en-tête et ses onglets (une seule lecture par requête, partagée par la bande et la seconde rangée). */
export const eventHeaderData = cache(
  async (orgSlug: string, eventId: string) => {
    const ctx = await requireOrgContext(orgSlug);
    const event = await db.event.findFirst({
      where: {
        id: eventId,
        organizationId: ctx.organization.id,
        deletedAt: null,
      },
      select: {
        title: true,
        slug: true,
        subdomain: true,
        status: true,
        startsAt: true,
        timezone: true,
        locationName: true,
        city: true,
        seatingMode: true,
        seatingMap: { select: { id: true } },
        _count: { select: { options: true, ambassadors: true } },
      },
    });
    if (!event) return null;
    const t = await getTranslations("nav");
    const base = `/o/${ctx.organization.slug}/events/${eventId}`;
    const { tabs, hidden } = buildEventTabs({
      t: (k) => t(k),
      base,
      used: {
        seating:
          event.seatingMode !== "GENERAL_ADMISSION" || !!event.seatingMap,
        options: event._count.options > 0,
        ambassadors: event._count.ambassadors > 0,
      },
      canPublish: can(ctx.membership, "EVENTS_PUBLISH"),
    });
    return { ctx, event, base, tabs, hidden };
  },
);
