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
import { EventResaleTable } from "./EventResaleTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("tabResale") };
}

const TONES = {
  ACTIVE: "success",
  RESERVED: "warning",
  SOLD: "dark",
  CANCELLED: "neutral",
  EXPIRED: "neutral",
  FAILED: "danger",
} as const;

/** US-RSL-05 : suivi des reventes, retrait d'une annonce, lien vers les réglages. */
export default async function ResaleAdminPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  if (
    !can(ctx.membership, "RESALE_MANAGE") &&
    !can(ctx.membership, "ORDERS_VIEW")
  )
    notFound();
  const event = await findEvent(ctx, eventId);
  const listings = await listingsForOrganizer(eventId);
  const t = await getTranslations("resaleAdmin");
  const locale = (await getLocale()) as Locale;
  const money = (v: number) =>
    formatMoney(v, event.currency, locale, { trimZeroCents: true });
  const count = (s: string) => listings.filter((l) => l.status === s).length;
  const soldAmount = listings
    .filter((l) => l.status === "SOLD")
    .reduce((n, l) => n + l.priceMinor, 0);
  const manage = can(ctx.membership, "RESALE_MANAGE") && !ctx.readOnly;
  return (
    <div className="grid gap-6">
      <Card className="grid gap-3 sm:grid-cols-4">
        {[
          {
            label: t("statActive"),
            value: String(count("ACTIVE") + count("RESERVED")),
          },
          { label: t("statSold"), value: String(count("SOLD")) },
          { label: t("statAmount"), value: money(soldAmount) },
          { label: t("statFailed"), value: String(count("FAILED")) },
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
      <p className="text-sm text-ink-muted">
        {event.resaleEnabled
          ? t("enabled", { hours: event.resaleCutoffMinutes / 60 })
          : t("disabled")}{" "}
        <Link
          href={`/o/${orgSlug}/events/${eventId}/settings`}
          className="font-semibold text-ink underline underline-offset-4"
        >
          {t("changeSettings")}
        </Link>
      </p>
      <EventResaleTable
        orgSlug={orgSlug}
        eventId={eventId}
        rows={listings.map((l) => ({
          id: l.id,
          code: l.ticket.shortCode,
          type: l.ticket.ticketType.name,
          seller: l.sellerEmail,
          price: l.priceMinor === 0 ? null : money(l.priceMinor),
          priceMinor: l.priceMinor,
          face: money(l.faceValueMinor),
          status: l.status,
          statusLabel: t(`status_${l.status}`),
          tone: TONES[l.status],
          listed: formatDateTime(l.createdAt, event.timezone, locale, "short"),
          listedAt: l.createdAt.getTime(),
          sold: l.soldAt
            ? formatDateTime(l.soldAt, event.timezone, locale, "short")
            : null,
          refund:
            l.sellerRefundMinor != null && l.sellerRefundMinor > 0
              ? money(l.sellerRefundMinor)
              : null,
          cancellable: manage && l.status === "ACTIVE",
        }))}
      />
    </div>
  );
}
