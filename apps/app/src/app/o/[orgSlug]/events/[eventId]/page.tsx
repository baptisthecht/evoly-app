import { can } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CopyButton } from "@/components/CopyButton";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { cn } from "@/components/ui/cn";
import { requireOrgContext } from "@/server/context";
import { eventPublicationBlockers, getEventWithTickets } from "@/server/events";
import { eventShortUrl } from "@/server/urls";
import { canonicalEventUrl } from "@/server/canonical";
import { EventCommand } from "./EventCommands";
import { CancelEvent } from "./CancelEvent";
import { AutoRefresh } from "@/components/public/AutoRefresh";
import { db } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("tabOverview") };
}

export default async function EventOverview({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await getEventWithTickets(ctx, eventId);
  const t = await getTranslations("events");
  const locale = (await getLocale()) as Locale;
  const blockers = event.status === "DRAFT" || event.status === "SALES_PAUSED" ? await eventPublicationBlockers(ctx, eventId) : [];
  const url = await canonicalEventUrl({ id: ctx.organization.id, subdomain: ctx.organization.subdomain, slug: ctx.organization.slug, features: ctx.features }, event); // RG-DOM-06
  const short = eventShortUrl(event.publicCode);
  const canPublish = can(ctx.membership, "EVENTS_PUBLISH") && !ctx.readOnly;
  const sold = event.ticketTypes.reduce((n, tt) => n + tt.quantitySold, 0);
  // billets vendus par palier (commandes payées), pour les tarifs à prix dynamiques
  const tierRows = await db.orderItem.groupBy({ by: ["ticketTypeId", "priceTierId"], where: { order: { eventId, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } } }, _sum: { quantity: true } });
  const tierNames = new Map((await db.priceTier.findMany({ where: { ticketType: { eventId } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
  const tiersSold = new Map<string, Array<{ name: string; sold: number }>>();
  for (const r of tierRows) {
    const list = tiersSold.get(r.ticketTypeId) ?? [];
    list.push({ name: r.priceTierId ? (tierNames.get(r.priceTierId) ?? "—") : t("basePrice"), sold: r._sum.quantity ?? 0 });
    tiersSold.set(r.ticketTypeId, list);
  }
  const gross = event.ticketTypes.reduce((n, tt) => n + tt.quantitySold * tt.priceMinor, 0);
  const checks = [
    { key: "NO_TICKET_TYPE", done: !blockers.includes("NO_TICKET_TYPE"), href: `/o/${orgSlug}/events/${eventId}/tickets` },
    { key: "STRIPE_REQUIRED", done: !blockers.includes("STRIPE_REQUIRED"), href: `/o/${orgSlug}/settings/payments` },
    { key: "IN_THE_PAST", done: !blockers.includes("IN_THE_PAST"), href: `/o/${orgSlug}/events/${eventId}/settings` },
  ];
  const isLive = event.status === "PUBLISHED" || event.status === "SALES_PAUSED";
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <div className="grid min-w-0 content-start gap-6">
        {event.status === "DRAFT" || event.status === "SALES_PAUSED" ? (
          <Card className="grid gap-4">
            <h2 className="font-display text-xl tracking-[var(--tracking-title)]">{t(event.status === "DRAFT" ? "checklistTitle" : "pausedTitle")}</h2>
            <ul className="grid gap-3">
              {checks.map((c) => (
                <li key={c.key} className="flex items-start gap-3">
                  <span aria-hidden="true" className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold", c.done ? "bg-success text-blanc" : "bg-surface-sunken text-ink-muted ring-1 ring-line-strong")}>
                    {c.done ? "✓" : ""}
                  </span>
                  <div className="grid gap-0.5">
                    <p className={cn("font-medium", c.done && "text-ink-muted")}>{t(`check_${c.key}`)}</p>
                    {!c.done ? (
                      <Link href={c.href} className="text-sm font-semibold underline underline-offset-4">
                        {t(`checkFix_${c.key}`)}
                      </Link>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              {canPublish && blockers.length === 0 ? <EventCommand orgSlug={orgSlug} eventId={eventId} command={event.status === "DRAFT" ? "publish" : "resume"} variant="primary" /> : null}
              <Link href={`/o/${orgSlug}/events/${eventId}/preview`} className={buttonClass("secondary", "lg")}>
                {t("preview")}
              </Link>
            </div>
          </Card>
        ) : null}

        {isLive ? (
          <Card className="grid gap-4">
            <h2 className="font-display text-xl tracking-[var(--tracking-title)]">{t("linksTitle")}</h2>
            {[
              { label: t("linkPage"), value: url },
              { label: t("linkShort"), value: short },
            ].map((l) => (
              <div key={l.label} className="grid min-w-0 gap-2">
                <p className="font-label text-[0.8rem] font-bold text-ink-muted">{l.label}</p>
                <div className="flex min-w-0 items-center gap-2">
                  <a href={l.value} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate rounded-md bg-surface-sunken px-3 py-2.5 font-mono text-sm">
                    {l.value.replace(/^https?:\/\//, "")}
                  </a>
                  <CopyButton value={l.value} />
                </div>
              </div>
            ))}
          </Card>
        ) : null}

        <Card className="grid gap-4">
          <h2 className="font-display text-xl tracking-[var(--tracking-title)]">{t("salesTitle")}</h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="font-label text-[0.8rem] font-bold text-ink-muted">{t("statSold")}</p>
              <p className="font-display text-3xl tracking-[-0.04em] tabular-nums">{sold}</p>
            </div>
            {can(ctx.membership, "FINANCE_VIEW") ? (
              <div>
                <p className="font-label text-[0.8rem] font-bold text-ink-muted">{t("statGross")}</p>
                <p className="font-display text-3xl tracking-[-0.04em] tabular-nums">{formatMoney(gross, event.currency, locale)}</p>
              </div>
            ) : null}
          </div>
          <ul className="grid gap-2">
            {event.ticketTypes.map((tt) => (
              <li key={tt.id} className="grid gap-1 border-t border-line pt-2 text-sm">
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate">{tt.name}</span>
                  <span className="font-label font-bold tabular-nums">{tt.quantity != null ? `${tt.quantitySold} / ${tt.quantity}` : tt.quantitySold}</span>
                </span>
                {/* RG-TKT-11 : ventes par palier de prix */}
                {(tiersSold.get(tt.id) ?? []).length > 1 ? (
                  <span className="text-xs text-ink-muted" data-testid="tier-sales">{(tiersSold.get(tt.id) ?? []).map((x) => `${x.name} : ${x.sold}`).join(" · ")}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <aside className="grid min-w-0 content-start gap-3">
        {/* US-STAT-01 : ventes et remplissage à jour sans recharger la page */}
        <AutoRefresh everyMs={5_000} maxTimes={720} />
        {can(ctx.membership, "ORDERS_VIEW") ? (
          <a href={`/o/${orgSlug}/events/${eventId}/participants`} className="rounded-full px-4 py-3 text-center text-sm font-semibold shadow-[inset_0_0_0_1.5px_var(--line-strong)]">
            {t("exportParticipants")}
          </a>
        ) : null}
        <Card className="grid gap-3">
          <h2 className="font-display text-lg tracking-[var(--tracking-title)]">{t("actionsTitle")}</h2>
          {canPublish && event.status === "PUBLISHED" ? <EventCommand orgSlug={orgSlug} eventId={eventId} command="pause" /> : null}
          {isLive ? (
            <a href={url} target="_blank" rel="noreferrer" className={buttonClass("secondary", "lg", "w-full")}>
              {t("openPublicPage")}
            </a>
          ) : null}
          {can(ctx.membership, "EVENTS_CREATE") && !ctx.readOnly ? <EventCommand orgSlug={orgSlug} eventId={eventId} command="duplicate" variant="secondary" /> : null}
          {can(ctx.membership, "EVENTS_DELETE") && event.status === "DRAFT" ? <EventCommand orgSlug={orgSlug} eventId={eventId} command="delete" variant="ghost" confirm={t("confirmDelete")} /> : null}
          {can(ctx.membership, "EVENTS_CANCEL") && !ctx.readOnly && isLive ? <CancelEvent orgSlug={orgSlug} eventId={eventId} title={event.title} paidOrders={await db.order.count({ where: { eventId, totalMinor: { gt: 0 }, status: { in: ["PAID", "PARTIALLY_REFUNDED"] } } })} /> : null}
          {event.status === "CANCELLED" ? <p className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">{t("cancelledNotice", { reason: event.cancellationReason ?? "" })}</p> : null}
        </Card>
      </aside>
    </div>
  );
}
