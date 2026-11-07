import { can } from "@evoly/core";
import type { Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { EventsTable } from "@/components/events/EventsTable";
import { ButtonTabs } from "@/components/ui/ButtonTabs";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { SearchField, SectionTitle } from "@/components/ui/Controls";
import { eventPublicUrl } from "@/server/urls";
import { requireOrgContext } from "@/server/context";
import { listEvents } from "@/server/events";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("events") };
}

const TABS = ["upcoming", "past", "drafts", "archived"] as const;
type Tab = (typeof TABS)[number];
const CLOSED = ["ENDED", "ARCHIVED", "CANCELLED"];

/**
 * Événements (refonte A3, maquette UIUX/pages-a3.html) : onglets en boutons (à venir, passés, brouillons, archivés),
 * recherche, et le tableau des événements ; sous « À venir », les deux derniers événements passés.
 */
export default async function EventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? "")
    ? (sp.tab as Tab)
    : "upcoming";
  const q = (sp.q ?? "").trim().toLowerCase();
  const ctx = await requireOrgContext(orgSlug);
  const t = await getTranslations("events");
  const locale = (await getLocale()) as Locale;
  const all = (await listEvents(ctx.organization.id)).map((e) => ({
    ...e,
    url: eventPublicUrl(ctx.organization, e),
  }));
  const events = q ? all.filter((e) => e.title.toLowerCase().includes(q)) : all;
  const now = Date.now();
  const groups: Record<Tab, typeof events> = {
    upcoming: events.filter(
      (e) =>
        e.status !== "DRAFT" &&
        e.startsAt.getTime() >= now &&
        !CLOSED.includes(e.status),
    ),
    past: events
      .filter(
        (e) =>
          e.status !== "DRAFT" &&
          e.status !== "ARCHIVED" &&
          (e.startsAt.getTime() < now || CLOSED.includes(e.status)),
      )
      .reverse(),
    drafts: events.filter((e) => e.status === "DRAFT"),
    archived: events.filter((e) => e.status === "ARCHIVED").reverse(),
  };
  const base = `/o/${orgSlug}`;
  const money = can(ctx.membership, "FINANCE_VIEW");
  const canCreate = can(ctx.membership, "EVENTS_CREATE") && !ctx.readOnly;
  const href = (k: Tab) =>
    `${base}/events${k === "upcoming" ? "" : `?tab=${k}`}`;

  if (all.length === 0)
    return (
      <EmptyState
        title={t("emptyTitle")}
        action={
          canCreate ? (
            <ButtonLink href={`${base}/events/new`} size="lg">
              {t("newEvent")}
            </ButtonLink>
          ) : null
        }
      >
        {t("emptyBody")}
      </EmptyState>
    );

  // refonte A3 (maquette UIUX/pages-a3.html) : sous « À venir », les brouillons suivent les événements publiés
  const list =
    tab === "upcoming" ? [...groups.upcoming, ...groups.drafts] : groups[tab];
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ButtonTabs
          label={t("tabsLabel")}
          current={href(tab)}
          items={TABS.map((k) => ({
            href: href(k),
            label: t(`group_${k}`),
            count: groups[k].length || undefined,
          }))}
        />
        <form action={`${base}/events`} role="search">
          {tab !== "upcoming" ? (
            <input type="hidden" name="tab" value={tab} />
          ) : null}
          <SearchField
            label={t("searchEvents")}
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder={t("searchEvents")}
            className="w-full sm:w-[260px]"
          />
        </form>
      </div>

      {list.length === 0 ? (
        <p className="border-y border-line py-4 text-ink-muted">
          {t("emptyTab")}
        </p>
      ) : (
        <EventsTable
          events={list}
          base={base}
          locale={locale}
          money={money}
          past={tab === "past" || tab === "archived"}
          highlightFirst={tab === "upcoming" && groups.upcoming.length > 0}
          menu
          canDuplicate={canCreate}
        />
      )}

      {tab === "upcoming" && groups.past.length > 0 && !q ? (
        <section aria-labelledby="recent-past">
          <SectionTitle
            id="recent-past"
            title={t("recentPast")}
            link={{ href: href("past"), label: t("allPast") }}
          />
          <EventsTable
            events={groups.past.slice(0, 2)}
            base={base}
            locale={locale}
            money={money}
            past
            head={false}
          />
        </section>
      ) : null}
    </div>
  );
}
