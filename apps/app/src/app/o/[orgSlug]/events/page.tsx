import { can } from "@evoly/core";
import type { Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { EventsTable } from "@/components/events/EventsTable";
import { ButtonTabs } from "@/components/ui/ButtonTabs";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
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
  const all = await listEvents(ctx.organization.id);
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

  const list = groups[tab];
  return (
    <div className="grid gap-5">
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
        <form
          action={`${base}/events`}
          className="flex items-center"
          role="search"
        >
          {tab !== "upcoming" ? (
            <input type="hidden" name="tab" value={tab} />
          ) : null}
          <label className="relative block">
            <span className="sr-only">{t("searchEvents")}</span>
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-subtle"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              name="q"
              defaultValue={sp.q ?? ""}
              placeholder={t("searchEvents")}
              className="h-9 w-64 rounded-lg bg-surface-raised pr-3 pl-9 text-[0.8125rem] ring-1 ring-line-strong outline-none placeholder:text-ink-subtle focus:ring-2 focus:ring-[var(--focus-ring)]"
            />
          </label>
        </form>
      </div>

      {list.length === 0 ? (
        <p className="border-y border-line py-4 text-[0.875rem] text-ink-muted">
          {t("emptyTab")}
        </p>
      ) : (
        <EventsTable
          events={list}
          base={base}
          locale={locale}
          money={money}
          past={tab === "past" || tab === "archived"}
        />
      )}

      {tab === "upcoming" && groups.past.length > 0 && !q ? (
        <section aria-labelledby="recent-past" className="grid gap-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="recent-past" className="text-[0.9375rem] font-semibold">
              {t("recentPast")}
            </h2>
            <Link
              href={href("past")}
              className="text-[0.8125rem] text-ink-muted underline-offset-4 hover:text-ink hover:underline"
            >
              {t("allPast")}
            </Link>
          </div>
          <EventsTable
            events={groups.past.slice(0, 2)}
            base={base}
            locale={locale}
            money={money}
            past
          />
        </section>
      ) : null}
    </div>
  );
}
