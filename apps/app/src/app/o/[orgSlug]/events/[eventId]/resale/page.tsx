import { can } from "@evoly/core";
import { formatDateTime, formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Badge, Card, EmptyState } from "@/components/ui/Card";
import { requireOrgContext } from "@/server/context";
import { findEvent } from "@/server/events";
import { listingsForOrganizer } from "@/server/resale";
import { CancelListing } from "./CancelListing";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("tabResale") };
}

const TONES = { ACTIVE: "success", RESERVED: "warning", SOLD: "dark", CANCELLED: "neutral", EXPIRED: "neutral", FAILED: "danger" } as const;

/** US-RSL-05 : suivi des reventes, retrait d'une annonce, lien vers les réglages. */
export default async function ResaleAdminPage({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  if (!can(ctx.membership, "RESALE_MANAGE") && !can(ctx.membership, "ORDERS_VIEW")) notFound();
  const event = await findEvent(ctx, eventId);
  const listings = await listingsForOrganizer(eventId);
  const t = await getTranslations("resaleAdmin");
  const locale = (await getLocale()) as Locale;
  const money = (v: number) => formatMoney(v, event.currency, locale, { trimZeroCents: true });
  const count = (s: string) => listings.filter((l) => l.status === s).length;
  const soldAmount = listings.filter((l) => l.status === "SOLD").reduce((n, l) => n + l.priceMinor, 0);
  const manage = can(ctx.membership, "RESALE_MANAGE") && !ctx.readOnly;
  return (
    <div className="grid max-w-5xl gap-6">
      <Card className="grid gap-3 sm:grid-cols-4">
        {[
          { label: t("statActive"), value: String(count("ACTIVE") + count("RESERVED")) },
          { label: t("statSold"), value: String(count("SOLD")) },
          { label: t("statAmount"), value: money(soldAmount) },
          { label: t("statFailed"), value: String(count("FAILED")) },
        ].map((s) => (
          <div key={s.label}>
            <p className="font-label text-[0.8rem] font-bold text-ink-muted">{s.label}</p>
            <p className="font-display text-3xl tracking-[-0.04em] tabular-nums">{s.value}</p>
          </div>
        ))}
      </Card>
      <p className="text-sm text-ink-muted">
        {event.resaleEnabled ? t("enabled", { hours: event.resaleCutoffMinutes / 60 }) : t("disabled")}{" "}
        <Link href={`/o/${orgSlug}/events/${eventId}/settings`} className="font-semibold text-ink underline underline-offset-4">
          {t("changeSettings")}
        </Link>
      </p>
      {listings.length === 0 ? <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState> : null}
      <ul className="grid gap-3">
        {listings.map((l) => (
          <li key={l.id}>
            <Card className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="grid min-w-0 gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{l.ticket.ticketType.name}</p>
                  <Badge tone={TONES[l.status]}>{t(`status_${l.status}`)}</Badge>
                  <span className="font-mono text-xs text-ink-muted">{l.ticket.shortCode}</span>
                </div>
                <p className="text-sm">
                  {l.priceMinor === 0 ? t("transfer") : money(l.priceMinor)} · {t("faceValue", { value: money(l.faceValueMinor) })} · {l.sellerEmail}
                </p>
                <p className="text-sm text-ink-muted">
                  {t("listedOn", { date: formatDateTime(l.createdAt, event.timezone, locale, "short") })}
                  {l.soldAt ? ` · ${t("soldOn", { date: formatDateTime(l.soldAt, event.timezone, locale, "short") })}` : ""}
                  {l.sellerRefundMinor != null && l.sellerRefundMinor > 0 ? ` · ${t("refunded", { amount: money(l.sellerRefundMinor) })}` : ""}
                </p>
                {l.status === "FAILED" ? <p className="text-sm text-danger">{t("failedHint")}</p> : null}
              </div>
              {manage && l.status === "ACTIVE" ? <CancelListing orgSlug={orgSlug} eventId={eventId} listingId={l.id} /> : null}
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
