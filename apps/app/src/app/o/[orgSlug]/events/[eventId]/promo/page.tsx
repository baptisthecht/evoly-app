import { can, hasFeature } from "@evoly/core";
import { formatDateTime, formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { listPromos } from "@/server/promos";
import { PromoForm } from "./PromoForm";
import { PromoTable } from "./PromoTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("tabPromo") };
}

export default async function PromoPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await getEventWithTickets(ctx, eventId);
  const promos = await listPromos(ctx, eventId);
  const t = await getTranslations("promo");
  const locale = (await getLocale()) as Locale;
  const manage =
    can(ctx.membership, "PROMO_MANAGE") &&
    !ctx.readOnly &&
    hasFeature(ctx.features, "PROMO_CODES");
  const names = new Map(event.ticketTypes.map((tt) => [tt.id, tt.name]));
  const symbol =
    new Intl.NumberFormat("fr-BE", {
      style: "currency",
      currency: event.currency,
    })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? event.currency;
  const value = (p: (typeof promos)[number]) =>
    p.discountType === "FREE"
      ? t("type_FREE")
      : p.discountType === "PERCENT"
        ? `−${(p.percentOffBps ?? 0) / 100} %`
        : `−${formatMoney(p.amountOffMinor ?? 0, event.currency, locale, { trimZeroCents: true })} ${t("perTicket")}`;
  return (
    <div className="grid gap-4">
      <p className="text-ink-muted">{t("intro")}</p>
      <PromoTable
        orgSlug={orgSlug}
        eventId={eventId}
        manage={manage}
        rows={promos.map((p) => ({
          id: p.id,
          code: p.code,
          active: p.isActive,
          unlocks: p.unlocksHidden,
          value: value(p),
          scope:
            p.ticketTypeIds.length === 0
              ? t("allTicketTypes")
              : p.ticketTypeIds.map((id) => names.get(id) ?? "?").join(", "),
          used: p.usedCount,
          max: p.maxUses ?? null,
          until: p.expiresAt
            ? formatDateTime(p.expiresAt, event.timezone, locale, "short")
            : null,
        }))}
      />
      {manage ? (
        <PromoForm
          orgSlug={orgSlug}
          eventId={eventId}
          ticketTypes={event.ticketTypes.map((tt) => ({
            id: tt.id,
            name: tt.name,
            codeOnly: tt.visibility === "CODE_ONLY",
          }))}
          currencySymbol={symbol}
        />
      ) : null}
    </div>
  );
}
