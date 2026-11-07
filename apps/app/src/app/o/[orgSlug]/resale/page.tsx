import { can } from "@evoly/core";
import { formatDateTime, formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { buttonClass } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/Controls";
import { Stat, StatCell, StatRow } from "@/components/ui/Stat";
import { requireOrgContext } from "@/server/context";
import { organizationResaleOverview } from "@/server/resale";
import { ResaleTable } from "./ResaleTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("resale") };
}

const TONES = {
  ACTIVE: "success",
  RESERVED: "warning",
  SOLD: "dark",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
  FAILED: "danger",
} as const;

/** US-RSL-05 : reventes de toute l'organisation ; la gestion des annonces se fait sur la page Revente de chaque événement. */
export default async function OrganizationResalePage({
  params,
}: {
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const ctx = await requireOrgContext(orgSlug);
  if (
    !can(ctx.membership, "RESALE_MANAGE") &&
    !can(ctx.membership, "ORDERS_VIEW")
  )
    notFound();
  const { totals, recent, events } = await organizationResaleOverview(
    ctx.organization.id,
  );
  const t = await getTranslations("resaleAdmin");
  const locale = (await getLocale()) as Locale;
  const money = (v: number) =>
    formatMoney(v, ctx.organization.currency, locale, { trimZeroCents: true });
  return (
    // refonte A3 : les chiffres comme ceux de l'accueil (filets verticaux), les dernières annonces, puis les événements
    <div className="grid gap-6">
      <StatRow label={t("recent")}>
        {[
          { label: t("statActive"), value: String(totals.open) },
          { label: t("statSold"), value: String(totals.sold) },
          { label: t("statAmount"), value: money(totals.amountMinor) },
          { label: t("statFailed"), value: String(totals.failed) },
        ].map((s) => (
          <StatCell key={s.label}>
            <Stat label={s.label} value={s.value} />
          </StatCell>
        ))}
      </StatRow>

      <section aria-labelledby="resale-recent">
        <SectionTitle id="resale-recent" title={t("recent")} />
        <ResaleTable
          rows={recent.map((l) => ({
            id: l.id,
            code: l.ticket.shortCode,
            type: l.ticket.ticketType.name,
            event: l.event.title,
            price: l.priceMinor === 0 ? null : money(l.priceMinor),
            priceMinor: l.priceMinor,
            status: l.status,
            statusLabel: t(`status_${l.status}`),
            tone: TONES[l.status],
            listed: formatDateTime(
              l.createdAt,
              l.event.timezone,
              locale,
              "short",
            ),
            listedAt: l.createdAt.getTime(),
            href: `/o/${orgSlug}/events/${l.event.id}/resale`,
          }))}
        />
      </section>

      {/* réglages de revente par événement : un raccourci discret, replié (le chevron dessiné de la barre latérale) */}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[13px] font-medium text-ink-muted hover:text-ink [&::-webkit-details-marker]:hidden">
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="size-3.5 shrink-0 transition-transform group-open:rotate-90"
          >
            <path d="m9 6 6 6-6 6" />
          </svg>
          {t("byEventShortcut")}
        </summary>
        {events.length === 0 ? (
          <p className="pt-3 text-[13px] text-ink-muted">{t("noEventsBody")}</p>
        ) : null}
        <ul role="list" className="pt-2">
          {events.map((e) => (
            <li
              key={e.id}
              className="grid gap-2 border-b border-line py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="grid min-w-0 gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-medium">{e.title}</p>
                  <Badge tone={e.resaleEnabled ? "success" : "neutral"} dot>
                    {e.resaleEnabled ? t("on") : t("off")}
                  </Badge>
                </div>
                <p className="text-[13px] text-ink-muted">
                  {formatDateTime(e.startsAt, e.timezone, locale, "short")} ·{" "}
                  {t("eventCounts", { open: e.open, sold: e.sold })}
                </p>
              </div>
              <Link
                href={`/o/${orgSlug}/events/${e.id}/resale`}
                className={buttonClass(
                  "secondary",
                  "sm",
                  "justify-self-start sm:justify-self-end",
                )}
              >
                {t("manage")}
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
