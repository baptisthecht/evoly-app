import { can } from "@evoly/core";
import { formatDateTime, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EventStatusBadge } from "@/components/events/StatusBadge";
import { ButtonLink } from "@/components/ui/Button";
import { Card, EmptyState } from "@/components/ui/Card";
import { requireOrgContext } from "@/server/context";
import { listEvents } from "@/server/events";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("events") };
}

export default async function EventsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const t = await getTranslations("events");
  const locale = (await getLocale()) as Locale;
  const events = await listEvents(ctx.organization.id);
  const now = Date.now();
  const groups = [
    {
      key: "upcoming",
      items: events.filter((e) => e.status !== "DRAFT" && e.startsAt.getTime() >= now && !["ENDED", "ARCHIVED", "CANCELLED"].includes(e.status)),
    },
    { key: "drafts", items: events.filter((e) => e.status === "DRAFT") },
    {
      key: "past",
      items: events.filter((e) => e.status !== "DRAFT" && (e.startsAt.getTime() < now || ["ENDED", "ARCHIVED", "CANCELLED"].includes(e.status))).reverse(),
    },
  ] as const;
  const canCreate = can(ctx.membership, "EVENTS_CREATE") && !ctx.readOnly;
  return (
    <div className="grid gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="page-title">{t("listTitle")}</h1>
        {canCreate ? <ButtonLink href={`/o/${orgSlug}/events/new`}>{t("newEvent")}</ButtonLink> : null}
      </header>
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
            <section key={g.key} className="grid gap-3" aria-labelledby={`group-${g.key}`}>
              <h2 id={`group-${g.key}`} className="font-label text-sm font-bold text-ink-muted">
                {t(`group_${g.key}`)} · {g.items.length}
              </h2>
              <ul className="grid gap-3">
                {g.items.map((e) => (
                  <li key={e.id}>
                    <Link href={`/o/${orgSlug}/events/${e.id}`} className="block rounded-lg">
                      <Card className="grid gap-3 transition-shadow hover:shadow-md sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                        <div className="grid min-w-0 gap-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-display text-lg tracking-[var(--tracking-title)]">{e.title}</p>
                            <EventStatusBadge status={e.status} />
                          </div>
                          <p className="text-sm text-ink-muted">
                            {formatDateTime(e.startsAt, e.timezone, locale, "short")}
                            {e.city ? ` · ${e.city}` : e.locationType === "ONLINE" ? ` · ${t("locationType_ONLINE")}` : ""}
                          </p>
                        </div>
                        <p className="font-label text-sm font-bold tabular-nums sm:text-right">
                          {e.total != null ? t("soldOf", { sold: e.sold, total: e.total }) : t("soldCount", { sold: e.sold })}
                        </p>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
      )}
    </div>
  );
}
