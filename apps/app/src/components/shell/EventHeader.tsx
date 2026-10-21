import { formatDateTime, type Locale } from "@evoly/i18n";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EventStatusBadge } from "@/components/events/StatusBadge";
import { buttonClass } from "@/components/ui/Button";
import { eventPublicUrl } from "@/server/urls";
import { eventHeaderData } from "./eventData";
import { EventTabs } from "./EventTabs";
import { ShareLink } from "./ShareLink";

/** Bande blanche pleine largeur en haut d'un événement (maquette validée) : fil d'Ariane, titre, statut, date, lieu, boutons, onglets. */
export async function EventHeader({ orgSlug, eventId }: { orgSlug: string; eventId: string }) {
  const data = await eventHeaderData(orgSlug, eventId);
  if (!data) return null;
  const { ctx, event, base, tabs, hidden } = data;
  const t = await getTranslations("nav");
  const locale = (await getLocale()) as Locale;
  const where = [event.locationName, event.city].filter(Boolean).join(", ");
  return (
    <div className="border-b border-line bg-surface-raised px-4 sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-[var(--content-max)] gap-3.5 pt-[1.125rem]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid min-w-0 gap-1">
            <p className="text-xs text-ink-muted">
              <Link href={`/o/${ctx.organization.slug}/events`} className="hover:text-ink">
                {t("events")}
              </Link>{" "}
              / {event.title}
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="page-title min-w-0 break-words">{event.title}</h1>
              <EventStatusBadge status={event.status} />
            </div>
            <p className="text-[0.8125rem] text-[var(--ink-muted)]">
              {formatDateTime(event.startsAt, event.timezone, locale)}
              {where ? ` · ${where}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`${base}/preview`} className={buttonClass("secondary")}>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 3h7v7" />
                <path d="M10 14L21 3" />
                <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
              </svg>
              {t("viewPage")}
            </Link>
            <ShareLink url={eventPublicUrl(ctx.organization, event)} title={event.title} />
          </div>
        </div>
        <EventTabs tabs={tabs} hidden={hidden} />
      </div>
    </div>
  );
}
