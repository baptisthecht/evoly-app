import { can } from "@evoly/core";
import { formatDateTime, type Locale } from "@evoly/i18n";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";
import { OrgNav } from "./OrgNav";
import { NavGlyph, SideNav, type NavSection } from "./SideNav";

/** Barre d'un événement : la barre de l'organisation laisse la place aux six parties de l'événement (arborescence du 18 octobre 2026). */
export async function EventNav({ orgSlug, eventId, current }: { orgSlug: string; eventId: string; current?: string }) {
  const ctx = await requireOrgContext(orgSlug);
  const event = await db.event.findFirst({
    where: { id: eventId, organizationId: ctx.organization.id, deletedAt: null },
    select: {
      title: true,
      startsAt: true,
      timezone: true,
      seatingMode: true,
      seatingMap: { select: { id: true } },
      _count: { select: { options: true, ambassadors: true } },
    },
  });
  if (!event) return <OrgNav orgSlug={orgSlug} />;
  const t = await getTranslations("nav");
  const locale = (await getLocale()) as Locale;
  const org = `/o/${ctx.organization.slug}`;
  const base = `${org}/events/${eventId}`;
  // fonctionnalités à activer : visibles si l'événement les utilise, ou si l'on est sur leur page ; les autres s'ajoutent à la demande
  const used = {
    seating: event.seatingMode !== "GENERAL_ADMISSION" || !!event.seatingMap,
    options: event._count.options > 0,
    ambassadors: event._count.ambassadors > 0,
  };
  const shown = (key: keyof typeof used) => used[key] || current === key;
  const hidden = (["seating", "options", "ambassadors"] as const).filter((k) => !shown(k));
  const sections: NavSection[] = [
    {
      label: t("groupTicketing"),
      icon: "ticket",
      items: [
        { label: t("tickets"), href: `${base}/tickets` },
        ...(shown("seating") ? [{ label: t("seating"), href: `${base}/seating` }] : []),
        { label: t("tables"), href: `${base}/tables` },
        ...(shown("options") ? [{ label: t("options"), href: `${base}/options` }] : []),
      ],
    },
    {
      label: t("groupSales"),
      icon: "megaphone",
      items: [
        { label: t("eventPage"), href: `${base}/appearance` },
        ...(can(ctx.membership, "EVENTS_PUBLISH") ? [{ label: t("launch"), href: `${base}/launch` }] : []),
        { label: t("promo"), href: `${base}/promo` },
        ...(shown("ambassadors") ? [{ label: t("ambassadors"), href: `${base}/ambassadors` }] : []),
        { label: t("embed"), href: `${base}/embed` },
      ],
    },
    {
      label: t("groupDayOf"),
      icon: "scan",
      items: [
        { label: t("entries"), href: `${base}/entries` },
        { label: t("cash"), href: `${base}/cash` },
        { label: t("labels"), href: `${base}/etiquettes` },
        { label: t("offline"), href: `${base}/offline` },
      ],
    },
    {
      label: t("groupAttendees"),
      icon: "users",
      items: [
        { label: t("orders"), href: `${base}/orders` },
        { label: t("resale"), href: `${base}/resale` },
        { label: t("emails"), href: `${base}/emails` },
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
          <div className="mb-1.5 grid gap-1.5 border-b border-line px-2 pt-1 pb-3">
            <p className="font-label text-[0.875rem] leading-tight font-bold break-words">{event.title}</p>
            <div className="flex flex-wrap items-center gap-1.5 text-[0.75rem] text-ink-muted">
              <span>{formatDateTime(event.startsAt, event.timezone, locale)}</span>
            </div>
          </div>
        </>
      }
      top={{ label: t("eventOverview"), href: base, exact: true, icon: "grid" }}
      sections={sections}
      after={
        hidden.length > 0 ? (
          <details className="group mt-3">
            <summary className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-lg border border-dashed border-line px-2.5 text-[0.78rem] font-medium text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
              <NavGlyph name="plus" className="size-[0.9rem]" />
              {t("addFeature")}
            </summary>
            <ul className="mt-1 grid gap-0.5 rounded-lg bg-surface-sunken p-1">
              {hidden.map((k) => (
                <li key={k}>
                  <Link href={`${base}/${k}`} className="grid rounded-md px-2 py-1.5 hover:bg-surface-raised">
                    <span className="text-[0.8rem] font-semibold">{t(k)}</span>
                    <span className="text-[0.72rem] text-ink-muted">{t(`hint_${k}`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        ) : null
      }
      bottom={[{ label: t("eventSettings"), href: `${base}/settings`, icon: "settings" }]}
    />
  );
}
