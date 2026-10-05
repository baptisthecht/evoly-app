import { formatDateTime, type Locale } from "@evoly/i18n";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { EventStatusBadge } from "@/components/events/StatusBadge";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";
import { EventTabs } from "./Tabs";

export default async function EventLayout({ children, params }: { children: ReactNode; params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await db.event.findFirst({
    where: { id: eventId, organizationId: ctx.organization.id, deletedAt: null },
    select: { title: true, status: true, startsAt: true, timezone: true },
  });
  if (!event) notFound();
  const t = await getTranslations("events");
  const locale = (await getLocale()) as Locale;
  const base = `/o/${orgSlug}/events/${eventId}`;
  return (
    <div className="grid gap-6">
      <header className="grid gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="page-title min-w-0 break-words">{event.title}</h1>
          <EventStatusBadge status={event.status} />
        </div>
        <p className="text-ink-muted">{formatDateTime(event.startsAt, event.timezone, locale)}</p>
      </header>
      <EventTabs
        tabs={[
          { href: base, label: t("tabOverview") },
          { href: `${base}/tickets`, label: t("tabTickets") },
          { href: `${base}/seating`, label: t("tabSeating") },
          { href: `${base}/promo`, label: t("tabPromo") },
          { href: `${base}/resale`, label: t("tabResale") },
          { href: `${base}/entries`, label: t("tabEntries") },
          { href: `${base}/settings`, label: t("tabSettings") },
        ]}
      />
      {children}
    </div>
  );
}
