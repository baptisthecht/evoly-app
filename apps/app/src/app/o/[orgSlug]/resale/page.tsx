import { can } from "@evoly/core";
import { formatDateTime, formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Card, EmptyState } from "@/components/ui/Card";
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
  const tn = await getTranslations("nav");
  const locale = (await getLocale()) as Locale;
  const money = (v: number) =>
    formatMoney(v, ctx.organization.currency, locale, { trimZeroCents: true });
  return (
    <div className="grid gap-6">
      <Card className="grid gap-3 sm:grid-cols-4">
        {[
          { label: t("statActive"), value: String(totals.open) },
          { label: t("statSold"), value: String(totals.sold) },
          { label: t("statAmount"), value: money(totals.amountMinor) },
          { label: t("statFailed"), value: String(totals.failed) },
        ].map((s) => (
          <div key={s.label}>
            <p className="font-label text-[0.8rem] font-bold text-ink-muted">
              {s.label}
            </p>
            <p className="font-display text-3xl tracking-[-0.04em] tabular-nums">
              {s.value}
            </p>
          </div>
        ))}
      </Card>

      <section className="grid gap-3" aria-labelledby="resale-recent">
        <h2
          id="resale-recent"
          className="font-display text-xl tracking-[var(--tracking-title)]"
        >
          {t("recent")}
        </h2>
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

      {/* réglages de revente par événement : un raccourci discret, replié */}
      <details className="group rounded-[var(--r-panel)] bg-surface-raised px-4 py-3 ring-1 ring-line">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          {t("byEventShortcut")}
          <span
            aria-hidden="true"
            className="text-ink-muted transition-transform group-open:rotate-180"
          >
            ⌄
          </span>
        </summary>
        {events.length === 0 ? (
          <p className="pt-3 text-sm text-ink-muted">{t("noEventsBody")}</p>
        ) : null}
        <ul className="grid gap-2 pt-3">
          {events.map((e) => (
            <li key={e.id}>
              <Card className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <div className="grid min-w-0 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold">{e.title}</p>
                    <Badge tone={e.resaleEnabled ? "success" : "neutral"}>
                      {e.resaleEnabled ? t("on") : t("off")}
                    </Badge>
                  </div>
                  <p className="text-sm text-ink-muted">
                    {formatDateTime(e.startsAt, e.timezone, locale, "short")} ·{" "}
                    {t("eventCounts", { open: e.open, sold: e.sold })}
                  </p>
                </div>
                <Link
                  href={`/o/${orgSlug}/events/${e.id}/resale`}
                  className="justify-self-start rounded-full px-4 py-2 text-sm font-semibold shadow-[inset_0_0_0_1.5px_var(--line-strong)] sm:justify-self-end"
                >
                  {t("manage")}
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
