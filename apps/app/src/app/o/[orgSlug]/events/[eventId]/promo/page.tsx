import { can, hasFeature } from "@evoly/core";
import { formatDateTime, formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Card, EmptyState } from "@/components/ui/Card";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { listPromos } from "@/server/promos";
import { PromoCommand, PromoForm } from "./PromoForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("tabPromo") };
}

export default async function PromoPage({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await getEventWithTickets(ctx, eventId);
  const promos = await listPromos(ctx, eventId);
  const t = await getTranslations("promo");
  const locale = (await getLocale()) as Locale;
  const manage = can(ctx.membership, "PROMO_MANAGE") && !ctx.readOnly && hasFeature(ctx.features, "PROMO_CODES");
  const names = new Map(event.ticketTypes.map((tt) => [tt.id, tt.name]));
  const symbol = new Intl.NumberFormat("fr-BE", { style: "currency", currency: event.currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? event.currency;
  const value = (p: (typeof promos)[number]) =>
    p.discountType === "FREE" ? t("type_FREE") : p.discountType === "PERCENT" ? `−${(p.percentOffBps ?? 0) / 100} %` : `−${formatMoney(p.amountOffMinor ?? 0, event.currency, locale, { trimZeroCents: true })} ${t("perTicket")}`;
  return (
    <div className="grid max-w-4xl gap-4">
      <p className="text-ink-muted">{t("intro")}</p>
      {promos.length === 0 ? <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState> : null}
      <ul className="grid gap-3">
        {promos.map((p) => (
          <li key={p.id}>
            <Card className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="grid min-w-0 gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-lg font-bold tracking-wider">{p.code}</p>
                  <Badge tone={p.isActive ? "success" : "neutral"}>{p.isActive ? t("active") : t("inactive")}</Badge>
                  {p.unlocksHidden ? <Badge>{t("unlocks")}</Badge> : null}
                </div>
                <p className="text-sm">
                  {value(p)} · {p.ticketTypeIds.length === 0 ? t("allTicketTypes") : p.ticketTypeIds.map((id) => names.get(id) ?? "?").join(", ")}
                </p>
                <p className="text-sm text-ink-muted">
                  {p.maxUses != null ? t("usesOf", { used: p.usedCount, max: p.maxUses }) : t("uses", { used: p.usedCount })}
                  {p.expiresAt ? ` · ${t("until", { date: formatDateTime(p.expiresAt, event.timezone, locale, "short") })}` : ""}
                </p>
              </div>
              {manage ? (
                <div className="flex flex-wrap gap-2">
                  <PromoCommand orgSlug={orgSlug} eventId={eventId} promoId={p.id} command={p.isActive ? "deactivate" : "activate"} label={p.isActive ? t("deactivate") : t("activate")} />
                  {p.usedCount === 0 ? <PromoCommand orgSlug={orgSlug} eventId={eventId} promoId={p.id} command="delete" label={t("delete")} /> : null}
                </div>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
      {manage ? <PromoForm orgSlug={orgSlug} eventId={eventId} ticketTypes={event.ticketTypes.map((tt) => ({ id: tt.id, name: tt.name, codeOnly: tt.visibility === "CODE_ONLY" }))} currencySymbol={symbol} /> : null}
    </div>
  );
}
