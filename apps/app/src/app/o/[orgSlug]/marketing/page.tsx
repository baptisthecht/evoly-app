import { can, eventCapacity, hasFeature, suggestLastSeats } from "@evoly/core";
import {
  formatMoney,
  formatShortDate,
  formatTime,
  type Locale,
} from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/Button";
import {
  BandKicker,
  BandText,
  BandTitle,
  HighlightBand,
} from "@/components/ui/HighlightBand";
import { Stat, StatCell, StatRow } from "@/components/ui/Stat";
import { SearchField } from "@/components/ui/Controls";
import { FilterSelect } from "@/components/ui/FilterSelect";
import { searchContacts, type ContactFilter } from "@/server/contacts";
import { db } from "@/lib/db";
import { requireOrgContext } from "@/server/context";
import { ImportContacts } from "./ImportContacts";
import {
  CampaignsTable,
  ContactsTable,
  EnableLastTickets,
  ImportDialog,
} from "./MarketingTables";

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
  const share = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 0,
  });
  const st = result.stats;
  // refonte A3 (maquette Marketing) : les chiffres des contacts en haut, avec leur complément
  const contactStats = (
    <StatRow label={t("stats")}>
      <StatCell>
        <Stat
          label={t("stat_all")}
          value={new Intl.NumberFormat(locale).format(st.all)}
          sub={st.new30 ? t("newContacts", { value: `+${st.new30}` }) : null}
          subTone="success"
        />
      </StatCell>
      <StatCell>
        <Stat
          label={t("stat_consenting")}
          value={new Intl.NumberFormat(locale).format(st.consenting)}
          sub={
            st.all
              ? t("shareOfContacts", {
                  pct: share.format(st.consenting / st.all),
                })
              : null
          }
        />
      </StatCell>
      <StatCell>
        <Stat
          label={t("stat_unsubscribed")}
          value={new Intl.NumberFormat(locale).format(st.unsubscribed)}
          sub={st.all ? share.format(st.unsubscribed / st.all) : null}
        />
      </StatCell>
    </StatRow>
  );
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
        <HighlightBand className="gap-2">
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
        </HighlightBand>
      </div>
    );
  if (tab === "campaigns") {
    // « Dernières places » : proposée pour l'événement en vente qui se remplit le plus, si elle est éteinte
    const candidates = pro
      ? await db.event.findMany({
          where: {
            organizationId: ctx.organization.id,
            deletedAt: null,
            status: "PUBLISHED",
            startsAt: { gt: new Date() },
            NOT: {
              automations: { some: { type: "LAST_TICKETS", enabled: true } },
            },
          },
          select: {
            id: true,
            title: true,
            capacity: true,
            ticketTypes: {
              where: { status: { not: "ARCHIVED" } },
              select: { quantity: true, quantitySold: true },
            },
          },
        })
      : [];
    const suggestion = candidates
      .map((e) => {
        const capacity = eventCapacity(
          e.capacity,
          e.ticketTypes.map((x) => x.quantity),
        );
        const sold = e.ticketTypes.reduce((n, x) => n + x.quantitySold, 0);
        return { ...e, capacity, sold };
      })
      .filter((e) => suggestLastSeats(e))
      .sort((a, b) => b.sold / b.capacity! - a.sold / a.capacity!)[0];
    const canManage = can(ctx.membership, "MARKETING_MANAGE") && !ctx.readOnly;
    return (
      <div className="grid gap-6">
        {banner}
        {contactStats}
        {!pro ? (
          <HighlightBand className="md:grid-cols-[minmax(0,1fr)_auto]">
            <BandText>{tc("upsell")}</BandText>
            <Link
              href={`/o/${orgSlug}/billing`}
              className={buttonClass("secondary")}
            >
              {t("upgrade")}
            </Link>
          </HighlightBand>
        ) : (
          <CampaignsTable
            rows={[...campaigns]
              // comme la maquette : les envoyées (la plus récente d'abord), puis les programmées, puis les brouillons
              .sort((a, b) => {
                const rank = (s: string) =>
                  s === "SENDING" || s === "SENT"
                    ? 0
                    : s === "SCHEDULED"
                      ? 1
                      : s === "DRAFT"
                        ? 2
                        : 3;
                const when = (c: (typeof campaigns)[number]) =>
                  (c.sentAt ?? c.scheduledAt ?? c.updatedAt).getTime();
                return (
                  rank(a.status) - rank(b.status) ||
                  (rank(a.status) === 1 ? when(a) - when(b) : when(b) - when(a))
                );
              })
              .map((c) => {
                const sent = c.status === "SENT" || c.status === "SENDING";
                const rate = (n: number) =>
                  c.deliveredCount
                    ? Math.round((n / c.deliveredCount) * 100)
                    : 0;
                const at = sent
                  ? (c.sentAt ?? c.updatedAt)
                  : (c.scheduledAt ?? c.updatedAt);
                const tz = ctx.organization.timezone;
                return {
                  id: c.id,
                  name: c.name,
                  subjectLine: tc("subjectLine", { subject: c.subject }),
                  status: c.status,
                  statusLabel: tc(`status_${c.status}`),
                  recipients:
                    sent || c.status === "SCHEDULED"
                      ? (c.recipientCount ?? null)
                      : null,
                  opensPct: sent ? rate(c.openCount) : null,
                  opens: sent ? c.openCount : null,
                  clicksPct: sent ? rate(c.clickCount) : null,
                  day:
                    c.status === "DRAFT"
                      ? tc("editedOn", {
                          date: formatShortDate(c.updatedAt, tz, locale),
                        })
                      : formatShortDate(at, tz, locale),
                  time:
                    c.status === "DRAFT" ? null : formatTime(at, tz, locale),
                  whenAt: at.getTime(),
                  href: `/o/${orgSlug}/marketing/campaigns/${c.id}`,
                };
              })}
          />
        )}
        {suggestion ? (
          <HighlightBand className="md:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <BandKicker>{t("automationKicker")}</BandKicker>
              <BandTitle small>
                {t("lastSeatsOff", { title: suggestion.title })}
              </BandTitle>
              <BandText>
                {t("lastSeatsText", {
                  pct: share.format(1 - suggestion.sold / suggestion.capacity!),
                })}
              </BandText>
            </div>
            {canManage ? (
              <EnableLastTickets
                orgSlug={orgSlug}
                eventId={suggestion.id}
                label={t("enable")}
              />
            ) : null}
          </HighlightBand>
        ) : null}
      </div>
    );
  }
  const shortDay = (d: Date) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: ctx.organization.timezone,
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(d);
  return (
    <div className="grid gap-6">
      {banner}
      {contactStats}
      {/* refonte A3 (maquette « Commandes ») : la recherche de 300 px et le filtre, l'import à droite */}
      <div className="flex flex-wrap items-center gap-2">
        <form className="flex flex-wrap items-center gap-2" role="search">
          <SearchField
            label={t("search")}
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder={t("searchPlaceholder")}
            className="w-full sm:w-[300px]"
          />
          <FilterSelect
            valueLabel={t(`filter_${filter}`)}
            name="filter"
            defaultValue={filter}
            autoSubmit
          >
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {t(`filter_${f}`)}
              </option>
            ))}
          </FilterSelect>
        </form>
        {can(ctx.membership, "MARKETING_MANAGE") ? (
          <span className="sm:ml-auto">
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
          </span>
        ) : null}
      </div>
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
          // dates courtes (« 8 sept. 2026 »), comme la maquette : la pastille reste sur une ligne
          consentLabel: c.unsubscribedAt
            ? t("unsubscribed", { date: shortDay(c.unsubscribedAt) })
            : c.marketingConsent
              ? t("consent", {
                  date: c.consentAt ? shortDay(c.consentAt) : "-",
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
          last: c.lastOrderAt ? shortDay(c.lastOrderAt) : null,
          lastAt: c.lastOrderAt ? c.lastOrderAt.getTime() : 0,
        }))}
      />
    </div>
  );
}
