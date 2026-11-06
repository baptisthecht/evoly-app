import { can } from "@evoly/core";
import { formatDateTime, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EventStatusBadge } from "@/components/events/StatusBadge";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { DateLeaf, SalesGauge } from "@/components/ui/SalesGauge";
import { requireOrgContext } from "@/server/context";
import { listEvents } from "@/server/events";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("events") };
}

export default async function EventsPage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const t = await getTranslations("events");
  const locale = (await getLocale()) as Locale;
  const events = await listEvents(ctx.organization.id);
  const now = Date.now();
  const groups = [
    {
      key: "upcoming",
      items: events.filter(
        (e) =>
          e.status !== "DRAFT" &&
          e.startsAt.getTime() >= now &&
          !["ENDED", "ARCHIVED", "CANCELLED"].includes(e.status),
      ),
    },
    { key: "drafts", items: events.filter((e) => e.status === "DRAFT") },
    {
      key: "past",
      items: events
        .filter(
          (e) =>
            e.status !== "DRAFT" &&
            (e.startsAt.getTime() < now ||
              ["ENDED", "ARCHIVED", "CANCELLED"].includes(e.status)),
        )
        .reverse(),
    },
  ] as const;
  const canCreate = can(ctx.membership, "EVENTS_CREATE") && !ctx.readOnly;
  return (
    <div className="grid gap-8">
      {events.length === 0 ? (
        <EmptyState
          title={t("emptyTitle")}
          action={
            canCreate ? (
              <ButtonLink href={`/o/${orgSlug}/events/new`} size="lg">
                {t("newEvent")}
              </ButtonLink>
            ) : null
          }
        >
          {t("emptyBody")}
        </EmptyState>
      ) : (
        groups
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <section
              key={g.key}
              className="grid gap-2"
              aria-labelledby={`group-${g.key}`}
            >
              <h2
                id={`group-${g.key}`}
                className="flex items-baseline gap-2 text-[0.9375rem] font-semibold"
              >
                {t(`group_${g.key}`)}
                <span className="text-[0.8125rem] font-normal text-ink-muted tabular-nums">
                  {g.items.length}
                </span>
              </h2>
              {/* refonte A3 : des lignes ouvertes par leur feuille de calendrier, la jauge du rythme pour ce qui est en vente */}
              <ul role="list" className="grid">
                {g.items.map((e) => {
                  const place =
                    e.city ??
                    (e.locationType === "ONLINE"
                      ? t("locationType_ONLINE")
                      : e.locationName);
                  return (
                    <li
                      key={e.id}
                      className="border-b border-line first:border-t"
                    >
                      <Link
                        href={`/o/${orgSlug}/events/${e.id}`}
                        className="grid gap-3 py-3 hover:bg-surface-sunken/50 sm:grid-cols-[minmax(0,1fr)_11rem_minmax(0,17rem)] sm:items-center sm:gap-6"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <DateLeaf
                            date={e.startsAt}
                            timezone={e.timezone}
                            locale={locale}
                            draft={e.status === "DRAFT"}
                          />
                          <span className="grid min-w-0 gap-0.5">
                            <span className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="truncate font-semibold">
                                {e.title}
                              </span>
                              <EventStatusBadge status={e.status} />
                            </span>
                            {place ? (
                              <span className="truncate text-[0.8125rem] text-ink-muted">
                                {place}
                              </span>
                            ) : null}
                          </span>
                        </span>
                        <span className="text-[0.8125rem] text-ink-muted max-sm:hidden">
                          {formatDateTime(
                            e.startsAt,
                            e.timezone,
                            locale,
                            "short",
                          )}
                        </span>
                        {g.key === "upcoming" ? (
                          <SalesGauge
                            sold={e.sold}
                            capacity={e.total}
                            pace={e.pace}
                            timezone={e.timezone}
                            locale={locale}
                          />
                        ) : (
                          <span className="text-[0.8125rem] tabular-nums">
                            {e.total != null
                              ? t("soldOf", { sold: e.sold, total: e.total })
                              : t("soldCount", { sold: e.sold })}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
      )}
    </div>
  );
}
