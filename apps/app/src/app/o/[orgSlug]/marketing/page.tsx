import { can, hasFeature } from "@evoly/core";
import { formatDate, formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/Button";
import { Badge, Card, EmptyState } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Field";
import { searchContacts, type ContactFilter } from "@/server/contacts";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("marketing") };
}

const FILTERS: ContactFilter[] = ["ALL", "CONSENTING", "UNSUBSCRIBED"];

/** US-MKT-04 : contacts et consentement ; rappels automatiques et campagnes (Pro). */
export default async function MarketingPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ q?: string; filter?: string; page?: string; tab?: string }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx.membership, "MARKETING_MANAGE") && !can(ctx.membership, "CONTACTS_EXPORT")) notFound();
  const filter = (FILTERS as string[]).includes(sp.filter ?? "") ? (sp.filter as ContactFilter) : "ALL";
  const result = await searchContacts(ctx, { q: sp.q, filter, page: Number(sp.page ?? 0) || 0 });
  const t = await getTranslations("marketing");
  const locale = (await getLocale()) as Locale;
  const pro = hasFeature(ctx.features, "EMAIL_MARKETING");
  const tab = sp.tab === "campaigns" ? "campaigns" : "contacts";
  const suspended =
    (await db.organization.findUniqueOrThrow({ where: { id: ctx.organization.id }, select: { marketingDailyCap: true } })).marketingDailyCap === 0;
  const banner = suspended ? (
    <p role="alert" className="rounded-lg bg-danger-soft px-5 py-4 font-semibold text-danger">
      {t("suspended")}
    </p>
  ) : null;
  const tc = await getTranslations("campaigns");
  const campaigns =
    tab === "campaigns" ? await db.emailCampaign.findMany({ where: { organizationId: ctx.organization.id }, orderBy: { createdAt: "desc" }, take: 50 }) : [];
  const tabs = (
    <nav className="flex w-fit gap-1 rounded-full bg-surface-sunken p-1" aria-label={t("tabs")}>
      {(["contacts", "campaigns"] as const).map((k) => (
        <Link
          key={k}
          href={`/o/${orgSlug}/marketing${k === "campaigns" ? "?tab=campaigns" : ""}`}
          aria-current={tab === k ? "page" : undefined}
          className={`flex h-10 items-center rounded-full px-4 text-sm font-semibold ${tab === k ? "bg-surface-inverse text-ink-inverse" : "text-ink-muted"}`}
        >
          {t(`tab_${k}`)}
        </Link>
      ))}
    </nav>
  );
  if (tab === "campaigns")
    return (
      <div className="grid gap-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="page-title">{t("title")}</h1>
          {pro && can(ctx.membership, "MARKETING_MANAGE") ? (
            <Link href={`/o/${orgSlug}/marketing/campaigns/new`} className={buttonClass("primary", "md")}>
              {tc("new")}
            </Link>
          ) : null}
        </header>
        {tabs}
        {banner}
        {!pro ? (
          <Card className="grid gap-2 bg-surface-accent">
            <p className="text-sm">{tc("upsell")}</p>
            <Link href={`/o/${orgSlug}/billing`} className={buttonClass("dark", "sm", "justify-self-start")}>
              {t("upgrade")}
            </Link>
          </Card>
        ) : campaigns.length === 0 ? (
          <EmptyState title={tc("emptyTitle")}>{tc("emptyBody")}</EmptyState>
        ) : (
          <ul className="grid gap-2">
            {campaigns.map((c) => (
              <li key={c.id}>
                <Link href={`/o/${orgSlug}/marketing/campaigns/${c.id}`} className="block rounded-lg">
                  <Card className="grid gap-2 transition-shadow hover:shadow-md sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div className="grid min-w-0 gap-1">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{c.name}</span>
                        <Badge tone={c.status === "SENT" ? "success" : c.status === "SCHEDULED" || c.status === "SENDING" ? "warning" : "neutral"}>
                          {tc(`status_${c.status}`)}
                        </Badge>
                      </p>
                      <p className="truncate text-sm text-ink-muted">« {c.subject} »</p>
                    </div>
                    <p className="text-sm text-ink-muted sm:text-right">
                      {c.status === "SENT" || c.status === "SENDING"
                        ? tc("listStats", {
                            recipients: c.recipientCount ?? 0,
                            opens: c.deliveredCount ? Math.round((c.openCount / c.deliveredCount) * 100) : 0,
                            clicks: c.deliveredCount ? Math.round((c.clickCount / c.deliveredCount) * 100) : 0,
                          })
                        : c.scheduledAt
                          ? tc("scheduledFor", { date: formatDate(c.scheduledAt, ctx.organization.timezone, locale) })
                          : tc("draftSince", { date: formatDate(c.updatedAt, ctx.organization.timezone, locale) })}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  return (
    <div className="grid gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="page-title">{t("title")}</h1>
        {can(ctx.membership, "CONTACTS_EXPORT") ? (
          <a href={`/o/${orgSlug}/marketing/export`} className={buttonClass("secondary", "md")}>
            {t("export")}
          </a>
        ) : null}
      </header>
      {tabs}
      {banner}
      <section className="grid gap-3 sm:grid-cols-3" aria-label={t("stats")}>
        {(["all", "consenting", "unsubscribed"] as const).map((k) => (
          <Card key={k} className="grid gap-1">
            <p className="font-label text-[0.8rem] font-bold text-ink-muted">{t(`stat_${k}`)}</p>
            <p className="font-display text-2xl tabular-nums">{result.stats[k]}</p>
          </Card>
        ))}
      </section>
      <Card className="grid gap-2 bg-surface-accent">
        <p className="font-semibold">{t("remindersTitle")}</p>
        <p className="text-sm">{pro ? t("remindersPro") : t("remindersFree")}</p>
        {!pro ? (
          <Link href={`/o/${orgSlug}/billing`} className={buttonClass("dark", "sm", "justify-self-start")}>
            {t("upgrade")}
          </Link>
        ) : null}
      </Card>
      <form className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]" role="search">
        <Input name="q" defaultValue={sp.q ?? ""} placeholder={t("searchPlaceholder")} aria-label={t("search")} />
        <Select name="filter" defaultValue={filter} aria-label={t("filter")}>
          {FILTERS.map((f) => (
            <option key={f} value={f}>
              {t(`filter_${f}`)}
            </option>
          ))}
        </Select>
        <button type="submit" className={buttonClass("dark", "md")}>
          {t("search")}
        </button>
      </form>
      {result.rows.length === 0 ? (
        <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState>
      ) : (
        <ul className="grid gap-2">
          {result.rows.map((c) => (
            <li key={c.id}>
              <Card className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="grid min-w-0 gap-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email}</span>
                    {c.unsubscribedAt ? (
                      <Badge tone="neutral">{t("unsubscribed", { date: formatDate(c.unsubscribedAt, ctx.organization.timezone, locale) })}</Badge>
                    ) : c.marketingConsent ? (
                      <Badge tone="success">{t("consent", { date: c.consentAt ? formatDate(c.consentAt, ctx.organization.timezone, locale) : "-" })}</Badge>
                    ) : (
                      <Badge>{t("noConsent")}</Badge>
                    )}
                  </p>
                  <p className="truncate text-sm text-ink-muted">{c.email}</p>
                </div>
                <p className="text-sm text-ink-muted sm:text-right">
                  {t("history", { orders: c.ordersCount, tickets: c.ticketsCount })} · {formatMoney(c.totalSpentMinor, ctx.organization.currency, locale)}
                  {c.lastOrderAt ? ` · ${formatDate(c.lastOrderAt, ctx.organization.timezone, locale)}` : ""}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
