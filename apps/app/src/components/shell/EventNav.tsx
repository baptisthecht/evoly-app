import { formatDateTime, type Locale } from "@evoly/i18n";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EventStatusBadge } from "@/components/events/StatusBadge";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";
import { OrgNav } from "./OrgNav";
import { NavGlyph, SideNav, type NavSection } from "./SideNav";

/** Barre d'un événement : la barre de l'organisation laisse la place aux six parties de l'événement (arborescence du 18 octobre 2026). */
export async function EventNav({ orgSlug, eventId }: { orgSlug: string; eventId: string }) {
  const ctx = await requireOrgContext(orgSlug);
  const event = await db.event.findFirst({
    where: { id: eventId, organizationId: ctx.organization.id, deletedAt: null },
    select: { title: true, status: true, startsAt: true, timezone: true },
  });
  if (!event) return <OrgNav orgSlug={orgSlug} />;
  const t = await getTranslations("nav");
  const locale = (await getLocale()) as Locale;
  const org = `/o/${ctx.organization.slug}`;
  const base = `${org}/events/${eventId}`;
  const sections: NavSection[] = [
    {
      label: t("groupTicketing"),
      icon: "ticket",
      items: [
        { label: t("tickets"), href: `${base}/tickets` },
        { label: t("seating"), href: `${base}/seating` },
        { label: t("tables"), href: `${base}/tables` },
        { label: t("options"), href: `${base}/options` },
      ],
    },
    {
      label: t("groupSales"),
      icon: "megaphone",
      items: [
        { label: t("promo"), href: `${base}/promo` },
        { label: t("ambassadors"), href: `${base}/ambassadors` },
        { label: t("embed"), href: `${base}/embed` },
      ],
    },
    {
      label: t("groupDayOf"),
      icon: "scan",
      items: [
        { label: t("entries"), href: `${base}/entries` },
        { label: t("labels"), href: `${base}/etiquettes` },
      ],
    },
    {
      label: t("groupAttendees"),
      icon: "users",
      items: [
        { label: t("orders"), href: `${org}/orders?event=${eventId}` },
        { label: t("resale"), href: `${base}/resale` },
      ],
    },
  ];
  return (
    <SideNav
      label={t("eventNav")}
      before={
        <>
          <Link href={`${org}/events`} className="flex h-8 items-center gap-1.5 rounded-lg px-2 text-[0.78rem] font-medium text-ink-muted hover:text-ink">
            <NavGlyph name="back" className="size-[0.95rem]" />
            {t("backToEvents")}
          </Link>
          <div className="mb-1.5 grid gap-1.5 border-b border-[rgba(34,34,34,0.08)] px-2 pt-1 pb-3">
            <p className="font-label text-[0.875rem] leading-tight font-bold break-words">{event.title}</p>
            <div className="flex flex-wrap items-center gap-1.5 text-[0.75rem] text-ink-muted">
              <EventStatusBadge status={event.status} />
              <span>{formatDateTime(event.startsAt, event.timezone, locale)}</span>
            </div>
          </div>
        </>
      }
      top={{ label: t("eventOverview"), href: base, exact: true, icon: "grid" }}
      sections={sections}
      bottom={[{ label: t("eventSettings"), href: `${base}/settings`, icon: "settings" }]}
    />
  );
}
