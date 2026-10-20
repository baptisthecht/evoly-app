import { can } from "@evoly/core";
import { formatDateTime, type Locale } from "@evoly/i18n";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { EventStatusBadge } from "@/components/events/StatusBadge";
import { buildEventTabs } from "@/components/shell/eventTabs";
import { EventTabs } from "@/components/shell/EventTabs";
import { ShareLink } from "@/components/shell/ShareLink";
import { buttonClass } from "@/components/ui/Button";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";
import { eventPublicUrl } from "@/server/urls";

/** En-tête d'un événement et ses six parties en onglets (maquette validée le 21 octobre 2026). */
export default async function EventLayout({ children, params }: { children: ReactNode; params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await db.event.findFirst({
    where: { id: eventId, organizationId: ctx.organization.id, deletedAt: null },
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
  if (!event) notFound();
  const t = await getTranslations("nav");
  const locale = (await getLocale()) as Locale;
  const org = `/o/${ctx.organization.slug}`;
  const base = `${org}/events/${eventId}`;
  const { tabs, hidden } = buildEventTabs({
    t: (k) => t(k),
    base,
    used: {
      seating: event.seatingMode !== "GENERAL_ADMISSION" || !!event.seatingMap,
      options: event._count.options > 0,
      ambassadors: event._count.ambassadors > 0,
    },
    canPublish: can(ctx.membership, "EVENTS_PUBLISH"),
  });
  const where = [event.locationName, event.city].filter(Boolean).join(", ");
  return (
    <div className="grid gap-5">
      <header className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="grid min-w-0 gap-1">
            <p className="text-xs text-ink-muted">
              <Link href={`${org}/events`} className="hover:text-ink">
                {t("events")}
              </Link>{" "}
              / <span className="text-ink">{event.title}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="page-title min-w-0 break-words">{event.title}</h1>
              <EventStatusBadge status={event.status} />
            </div>
            <p className="text-[0.8125rem] text-ink-muted">
              {formatDateTime(event.startsAt, event.timezone, locale)}
              {where ? ` · ${where}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`${base}/preview`} className={buttonClass("secondary")}>
              {t("viewPage")}
            </Link>
            <ShareLink url={eventPublicUrl(ctx.organization, event)} title={event.title} />
          </div>
        </div>
        <EventTabs tabs={tabs} hidden={hidden} />
      </header>
      {children}
    </div>
  );
}
