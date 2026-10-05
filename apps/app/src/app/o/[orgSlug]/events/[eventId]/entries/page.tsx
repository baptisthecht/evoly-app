import { can, hasFeature } from "@evoly/core";
import { formatDateTime, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import QRCode from "qrcode";
import { AutoRefresh } from "@/components/public/AutoRefresh";
import { Badge, Card, EmptyState } from "@/components/ui/Card";
import { requireOrgContext } from "@/server/context";
import { findEvent } from "@/server/events";
import { attendanceStats, listScannerLinks } from "@/server/scanner";
import { LinkActions, NewScannerLink, OpenScanner } from "./EntriesClient";
import { OccupancyPlan } from "@/components/seating/OccupancyPlan";
import { seatOccupancy } from "@/server/seatingEditor";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("tabEntries") };
}

/** Onglet Entrées : suivi en direct (RG-SCN-09), liens bénévoles (US-SCN-01, US-SCN-05). */
export default async function EntriesPage({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const canManage = can(ctx.membership, "CHECKIN_MANAGE");
  const canScan = can(ctx.membership, "CHECKIN_SCAN");
  if (!canManage && !canScan && !can(ctx.membership, "STATS_VIEW")) notFound();
  const occupancy = hasFeature(ctx.features, "SEATING_MAPS") ? await seatOccupancy(ctx, eventId) : null;
  const event = await findEvent(ctx, eventId);
  const [stats, links] = await Promise.all([attendanceStats(eventId), canManage ? listScannerLinks(ctx, eventId) : Promise.resolve([])]);
  const t = await getTranslations("entries");
  const locale = (await getLocale()) as Locale;
  const now = new Date();
  const time = (d: Date) => new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", timeZone: event.timezone }).format(d);
  const qrs = await Promise.all(links.map((l) => QRCode.toString(l.url, { type: "svg", margin: 1, errorCorrectionLevel: "M" })));
  const pct = (n: number, total: number) => (total ? Math.round((n * 100) / total) : 0);
  return (
    <div className="grid max-w-5xl gap-6">
      {occupancy ? <OccupancyPlan data={occupancy} /> : null}
      <AutoRefresh everyMs={10_000} maxTimes={2_000} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="grid content-start gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-label text-[0.8rem] font-bold text-ink-muted">{t("present")}</p>
              <p className="font-display text-5xl tracking-[-0.05em] tabular-nums">
                {stats.present} <span className="text-2xl text-ink-muted">/ {stats.total}</span>
              </p>
            </div>
            <p className="font-display text-3xl tabular-nums">{Math.round(stats.rateBps / 100)} %</p>
          </div>
          <div
            className="h-3 overflow-hidden rounded-full bg-surface-sunken"
            role="progressbar"
            aria-valuenow={Math.round(stats.rateBps / 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("present")}
          >
            <div className="h-full rounded-full bg-success" style={{ width: `${stats.rateBps / 100}%` }} />
          </div>
          <ul className="grid gap-2">
            {stats.byType.map((row) => (
              <li key={row.name} className="grid gap-1">
                <div className="flex justify-between text-sm">
                  <span>{row.name}</span>
                  <span className="font-label font-bold tabular-nums">
                    {row.present} / {row.total}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                  <div className="h-full rounded-full bg-ink" style={{ width: `${pct(row.present, row.total)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          {canScan ? <OpenScanner orgSlug={orgSlug} eventId={eventId} /> : null}
        </Card>
        <Card className="grid content-start gap-3">
          <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("recentTitle")}</h2>
          {stats.recent.length === 0 ? <p className="text-sm text-ink-muted">{t("noScans")}</p> : null}
          <ol className="grid gap-2">
            {stats.recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 border-t border-line pt-2 text-sm">
                <span className="min-w-0 truncate">
                  <span className="font-label font-bold tabular-nums">{time(r.at)}</span> · {r.holder ?? t("unknownTicket")}
                  {r.gate ? <span className="text-ink-muted"> · {r.gate}</span> : null}
                  {r.offline ? <span className="text-ink-muted"> · {t("offline")}</span> : null}
                </span>
                <Badge tone={r.result === "VALID" ? "success" : r.result === "ALREADY_USED" ? "warning" : "danger"}>{t(`result_${r.result}`)}</Badge>
              </li>
            ))}
          </ol>
          {stats.byGate.length > 0 ? (
            <p className="border-t border-line pt-2 text-sm text-ink-muted">
              {t("byGate")} {stats.byGate.map((g) => `${g.gate} (${g.count})`).join(", ")}
            </p>
          ) : null}
        </Card>
      </div>

      {canManage ? (
        <section className="grid gap-3" aria-labelledby="links-title">
          <h2 id="links-title" className="font-display text-xl tracking-[var(--tracking-title)]">
            {t("linksTitle")}
          </h2>
          <p className="-mt-1 text-sm text-ink-muted">{t("linksIntro")}</p>
          {links.filter((l) => !l.personal).length === 0 ? <EmptyState title={t("noLinks")}>{t("noLinksBody")}</EmptyState> : null}
          <ul className="grid gap-3">
            {links.map((l, i) => {
              const status = l.revokedAt ? "REVOKED" : l.expiresAt <= now ? "EXPIRED" : "ACTIVE";
              return (
                <li key={l.id}>
                  <Card className="grid gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{l.displayLabel}</p>
                      {l.personal ? <Badge>{t("personal")}</Badge> : null}
                      <Badge tone={status === "ACTIVE" ? "success" : "neutral"}>{t(`status_${status}`)}</Badge>
                    </div>
                    <p className="text-sm text-ink-muted">
                      {t("expires", { date: formatDateTime(l.expiresAt, event.timezone, locale, "short") })} · {t("scans", { count: l._count.checkIns })}
                      {l.lastUsedAt ? ` · ${t("lastUsed", { time: time(l.lastUsedAt) })}` : ""}
                      {!l.allowManualSearch ? ` · ${t("noManualSearch")}` : ""}
                      {l.checkOnly ? ` · ${t("checkOnlyBadge")}` : ""}
                    </p>
                    {status === "ACTIVE" ? (
                      <p className="min-w-0 truncate rounded-md bg-surface-sunken px-3 py-2 font-mono text-xs" data-testid="scanner-url">
                        {l.url}
                      </p>
                    ) : null}
                    <LinkActions orgSlug={orgSlug} eventId={eventId} linkId={l.id} url={l.url} qrSvg={qrs[i]!} active={status === "ACTIVE"} />
                  </Card>
                </li>
              );
            })}
          </ul>
          <NewScannerLink orgSlug={orgSlug} eventId={eventId} />
        </section>
      ) : null}
    </div>
  );
}
