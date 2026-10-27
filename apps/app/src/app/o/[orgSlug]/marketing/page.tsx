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
import { ImportContacts } from "./ImportContacts";
import { CampaignsTable, ContactsTable, ImportDialog } from "./MarketingTables";

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
  searchParams: Promise<{
    q?: string;
    filter?: string;
    page?: string;
    tab?: string;
  }>;
}) {
  const { orgSlug } = await params;
  const sp = await searchParams;
  const ctx = await requireOrgContext(orgSlug);
  if (
    !can(ctx.membership, "MARKETING_MANAGE") &&
    !can(ctx.membership, "CONTACTS_EXPORT")
  )
    notFound();
  const filter = (FILTERS as string[]).includes(sp.filter ?? "")
    ? (sp.filter as ContactFilter)
    : "ALL";
  const result = await searchContacts(ctx, {
    q: sp.q,
    filter,
    page: Number(sp.page ?? 0) || 0,
  });
  const t = await getTranslations("marketing");
  const locale = (await getLocale()) as Locale;
  const pro = hasFeature(ctx.features, "EMAIL_MARKETING");
  const tab =
    sp.tab === "campaigns"
      ? "campaigns"
      : sp.tab === "automations"
        ? "automations"
        : "contacts";
  const suspended =
    (
      await db.organization.findUniqueOrThrow({
        where: { id: ctx.organization.id },
        select: { marketingDailyCap: true },
      })
    ).marketingDailyCap === 0;
  const banner = suspended ? (
    <p
      role="alert"
      className="rounded-lg bg-danger-soft px-5 py-4 font-semibold text-danger"
    >
      {t("suspended")}
    </p>
  ) : null;
  const tc = await getTranslations("campaigns");
  const campaigns =
    tab === "campaigns"
      ? await db.emailCampaign.findMany({
          where: { organizationId: ctx.organization.id },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : [];
  // rappels automatiques : leur propre onglet
  if (tab === "automations")
    return (
      <div className="grid gap-6">
        {banner}
        <Card className="grid gap-2 bg-surface-accent">
          <p className="font-semibold">{t("remindersTitle")}</p>
          <p className="text-sm">
            {pro ? t("remindersPro") : t("remindersFree")}
          </p>
          {!pro ? (
            <Link
              href={`/o/${orgSlug}/billing`}
              className={buttonClass("dark", "sm", "justify-self-start")}
            >
              {t("upgrade")}
            </Link>
          ) : null}
        </Card>
      </div>
    );
  if (tab === "campaigns")
    return (
      <div className="grid gap-6">
        {banner}
        {!pro ? (
          <Card className="grid gap-2 bg-surface-accent">
            <p className="text-sm">{tc("upsell")}</p>
            <Link
              href={`/o/${orgSlug}/billing`}
              className={buttonClass("dark", "sm", "justify-self-start")}
            >
              {t("upgrade")}
            </Link>
          </Card>
        ) : (
          <CampaignsTable
            rows={campaigns.map((c) => {
              const sent = c.status === "SENT" || c.status === "SENDING";
              const rate = (n: number) =>
                c.deliveredCount ? Math.round((n / c.deliveredCount) * 100) : 0;
              const at = sent
                ? (c.sentAt ?? c.updatedAt)
                : (c.scheduledAt ?? c.updatedAt);
              return {
                id: c.id,
                name: c.name,
                subject: c.subject,
                status: c.status,
                statusLabel: tc(`status_${c.status}`),
                recipients: sent ? (c.recipientCount ?? 0) : null,
                opens: sent ? rate(c.openCount) : null,
                clicks: sent ? rate(c.clickCount) : null,
                when: formatDate(at, ctx.organization.timezone, locale),
                whenAt: at.getTime(),
                href: `/o/${orgSlug}/marketing/campaigns/${c.id}`,
              };
            })}
          />
        )}
      </div>
    );
  return (
    <div className="grid gap-6">
      {banner}
      <section className="grid gap-3 sm:grid-cols-3" aria-label={t("stats")}>
        {(["all", "consenting", "unsubscribed"] as const).map((k) => (
          <Card key={k} className="grid gap-1">
            <p className="font-label text-[0.8rem] font-bold text-ink-muted">
              {t(`stat_${k}`)}
            </p>
            <p className="font-display text-2xl tabular-nums">
              {result.stats[k]}
            </p>
          </Card>
        ))}
      </section>
      {can(ctx.membership, "MARKETING_MANAGE") ? (
        <ImportDialog label={t("importTitle")}>
          <ImportContacts
            orgSlug={orgSlug}
            labels={{
              title: t("importTitle"),
              intro: t("importIntro"),
              file: t("importFile"),
              consent: t("importConsent"),
              submit: t("importSubmit"),
              doneTemplate: t.raw("importDone") as string,
              errors: {
                IMPORT_CONSENT_REQUIRED: t("importConsentRequired"),
                IMPORT_TOO_LARGE: t("importTooLarge"),
              },
              fallbackError: t("importError"),
            }}
          />
        </ImportDialog>
      ) : null}
      <form
        className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]"
        role="search"
      >
        <Input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder={t("searchPlaceholder")}
          aria-label={t("search")}
        />
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
      <ContactsTable
        rows={result.rows.map((c) => ({
          id: c.id,
          name: [c.firstName, c.lastName].filter(Boolean).join(" ") || c.email,
          email: c.email,
          consent: c.unsubscribedAt
            ? "unsubscribed"
            : c.marketingConsent
              ? "yes"
              : "no",
          consentLabel: c.unsubscribedAt
            ? t("unsubscribed", {
                date: formatDate(
                  c.unsubscribedAt,
                  ctx.organization.timezone,
                  locale,
                ),
              })
            : c.marketingConsent
              ? t("consent", {
                  date: c.consentAt
                    ? formatDate(c.consentAt, ctx.organization.timezone, locale)
                    : "-",
                })
              : t("noConsent"),
          orders: c.ordersCount,
          tickets: c.ticketsCount,
          spent: formatMoney(
            c.totalSpentMinor,
            ctx.organization.currency,
            locale,
          ),
          spentMinor: c.totalSpentMinor,
          last: c.lastOrderAt
            ? formatDate(c.lastOrderAt, ctx.organization.timezone, locale)
            : null,
          lastAt: c.lastOrderAt ? c.lastOrderAt.getTime() : 0,
        }))}
      />
    </div>
  );
}
