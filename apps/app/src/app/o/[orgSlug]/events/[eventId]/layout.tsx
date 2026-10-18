import { formatDateTime, type Locale } from "@evoly/i18n";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { EventStatusBadge } from "@/components/events/StatusBadge";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";
import Link from "next/link";

export default async function EventLayout({ children, params }: { children: ReactNode; params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await db.event.findFirst({
    where: { id: eventId, organizationId: ctx.organization.id, deletedAt: null },
    select: { title: true, status: true, startsAt: true, timezone: true },
  });
  if (!event) notFound();
  const t = await getTranslations("nav");
  const locale = (await getLocale()) as Locale;
  const base = `/o/${orgSlug}/events/${eventId}`;
  // les six parties de l'événement sont dans la barre latérale : plus d'onglets ici
  return (
    <div className="grid gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="page-title min-w-0 break-words">{event.title}</h1>
            <EventStatusBadge status={event.status} />
          </div>
          <p className="text-[0.84rem] text-ink-muted">{formatDateTime(event.startsAt, event.timezone, locale)}</p>
        </div>
        <Link
          href={`${base}/preview`}
          className="inline-flex h-9 items-center rounded-full border border-line bg-surface-raised px-3.5 text-[0.84rem] font-semibold"
        >
          {t("viewPage")}
        </Link>
      </header>
      {children}
    </div>
  );
}
