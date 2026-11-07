import { can, hasFeature } from "@evoly/core";
import { formatDateTime, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import QRCode from "qrcode";
import { AutoRefresh } from "@/components/public/AutoRefresh";
import { Badge, EmptyState } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/Controls";
import { Gauge } from "@/components/ui/Gauge";
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
export default async function EntriesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const canManage = can(ctx.membership, "CHECKIN_MANAGE");
  const canScan = can(ctx.membership, "CHECKIN_SCAN");
  if (!canManage && !canScan && !can(ctx.membership, "STATS_VIEW")) notFound();
  const occupancy = hasFeature(ctx.features, "SEATING_MAPS")
    ? await seatOccupancy(ctx, eventId)
    : null;
  const event = await findEvent(ctx, eventId);
  const [stats, links] = await Promise.all([
    attendanceStats(eventId),
    canManage ? listScannerLinks(ctx, eventId) : Promise.resolve([]),
  ]);
  const t = await getTranslations("entries");
  // section 9.27 : rapport de caisse des ventes sur place
  const locale = (await getLocale()) as Locale;
  const now = new Date();
  const time = (d: Date) =>
    new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: event.timezone,
    }).format(d);
  const qrs = await Promise.all(
    links.map((l) =>
      QRCode.toString(l.url, {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
      }),
    ),
  );
  const pct = (n: number, total: number) =>
    total ? Math.round((n * 100) / total) : 0;
  return (
    <div className="grid gap-6">
      {occupancy ? <OccupancyPlan data={occupancy} /> : null}
      <AutoRefresh everyMs={10_000} maxTimes={2_000} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* refonte A3 : l'indicateur comme ceux de l'accueil (27 px), la jauge de 6 px, les tarifs en dessous */}
        <section
          className="grid content-start gap-3.5"
          aria-label={t("present")}
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[13px] text-ink-muted">{t("present")}</p>
              <p className="mt-0.5 font-figures text-[27px] leading-[1.15] tracking-[var(--tracking-figures)] tabular-nums">
                {stats.present}{" "}
                <span className="text-ink-muted">/ {stats.total}</span>
              </p>
            </div>
            <p className="font-figures text-[27px] leading-[1.15] tracking-[var(--tracking-figures)] tabular-nums">
              {Math.round(stats.rateBps / 100)} %
            </p>
          </div>
          <div
            role="progressbar"
            aria-valuenow={Math.round(stats.rateBps / 100)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t("present")}
          >
            <Gauge ratio={stats.rateBps / 10_000} tone="success" />
          </div>
          <ul role="list">
            {stats.byType.map((row) => (
              <li
                key={row.name}
                className="grid gap-1.5 border-b border-line py-2.5"
              >
                <div className="flex justify-between text-[13px]">
                  <span>{row.name}</span>
                  <span className="font-medium tabular-nums">
                    {row.present} / {row.total}
                  </span>
                </div>
                <Gauge ratio={pct(row.present, row.total) / 100} />
              </li>
            ))}
          </ul>
          {canScan ? <OpenScanner orgSlug={orgSlug} eventId={eventId} /> : null}
        </section>
        <section className="grid content-start" aria-labelledby="recent-scans">
          <SectionTitle id="recent-scans" title={t("recentTitle")} />
          {stats.recent.length === 0 ? (
            <p className="border-b border-line py-[9px] text-ink-muted">
              {t("noScans")}
            </p>
          ) : null}
          <ol role="list">
            {stats.recent.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 border-b border-line py-[9px]"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium tabular-nums">{time(r.at)}</span>{" "}
                  · {r.holder ?? t("unknownTicket")}
                  {r.gate ? (
                    <span className="text-ink-muted"> · {r.gate}</span>
                  ) : null}
                  {r.offline ? (
                    <span className="text-ink-muted"> · {t("offline")}</span>
                  ) : null}
                </span>
                <Badge
                  tone={
                    r.result === "VALID"
                      ? "success"
                      : r.result === "ALREADY_USED"
                        ? "warning"
                        : "danger"
                  }
                >
                  {t(`result_${r.result}`)}
                </Badge>
              </li>
            ))}
          </ol>
          {stats.byGate.length > 0 ? (
            <p className="pt-2 text-[13px] text-ink-muted">
              {t("byGate")}{" "}
              {stats.byGate.map((g) => `${g.gate} (${g.count})`).join(", ")}
            </p>
          ) : null}
        </section>
      </div>

      {canManage ? (
        <section className="grid gap-3" aria-labelledby="links-title">
          <div>
            <SectionTitle
              id="links-title"
              title={t("linksTitle")}
              className="mb-0.5"
            />
            <p className="text-[13px] text-ink-muted">{t("linksIntro")}</p>
          </div>
          {links.filter((l) => !l.personal).length === 0 ? (
            <EmptyState title={t("noLinks")}>{t("noLinksBody")}</EmptyState>
          ) : null}
          <ul role="list">
            {links.map((l, i) => {
              const status = l.revokedAt
                ? "REVOKED"
                : l.expiresAt <= now
                  ? "EXPIRED"
                  : "ACTIVE";
              return (
                <li key={l.id} className="border-b border-line py-3.5">
                  <div className="grid gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{l.displayLabel}</p>
                      {l.personal ? <Badge>{t("personal")}</Badge> : null}
                      <Badge tone={status === "ACTIVE" ? "success" : "neutral"}>
                        {t(`status_${status}`)}
                      </Badge>
                    </div>
                    <p className="text-[13px] text-ink-muted">
                      {t("expires", {
                        date: formatDateTime(
                          l.expiresAt,
                          event.timezone,
                          locale,
                          "short",
                        ),
                      })}{" "}
                      · {t("scans", { count: l._count.checkIns })}
                      {l.lastUsedAt
                        ? ` · ${t("lastUsed", { time: time(l.lastUsedAt) })}`
                        : ""}
                      {!l.allowManualSearch ? ` · ${t("noManualSearch")}` : ""}
                      {l.checkOnly ? ` · ${t("checkOnlyBadge")}` : ""}
                    </p>
                    {status === "ACTIVE" ? (
                      <p
                        className="min-w-0 truncate rounded-[8px] bg-surface-soft px-3 py-2 text-[12.5px] text-ink-body"
                        data-testid="scanner-url"
                      >
                        {l.url}
                      </p>
                    ) : null}
                    <LinkActions
                      orgSlug={orgSlug}
                      eventId={eventId}
                      linkId={l.id}
                      url={l.url}
                      qrSvg={qrs[i]!}
                      active={status === "ACTIVE"}
                    />
                  </div>
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
