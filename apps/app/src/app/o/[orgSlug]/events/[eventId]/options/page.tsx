import { can, hasFeature } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ProLocked } from "@/components/ProLocked";
import { Badge, Card, EmptyState } from "@/components/ui/Card";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { listOptions } from "@/server/options";
import { OptionsTable } from "./OptionsTable";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("tabOptions") };
}

/** Options et consommations prépayées de l'événement (section 9.29, Pro). */
export default async function OptionsPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await getEventWithTickets(ctx, eventId);
  const t = await getTranslations("options");
  if (!hasFeature(ctx.features, "PREPAID_OPTIONS")) {
    return (
      <div className="grid gap-4">
        <p className="text-ink-muted">{t("intro")}</p>
        <ProLocked
          orgSlug={orgSlug}
          feature="PREPAID_OPTIONS"
          canUpgrade={can(ctx.membership, "BILLING_MANAGE")}
        />
      </div>
    );
  }
  const options = await listOptions(ctx, eventId);
  const locale = (await getLocale()) as Locale;
  const manage =
    can(ctx.membership, "TICKETS_MANAGE") &&
    !ctx.readOnly &&
    !["CANCELLED", "ENDED", "ARCHIVED"].includes(event.status);
  const symbol =
    new Intl.NumberFormat("fr-BE", {
      style: "currency",
      currency: event.currency,
    })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? event.currency;
  return (
    <div className="grid gap-4">
      <p className="text-ink-muted">{t("intro")}</p>
      <OptionsTable
        orgSlug={orgSlug}
        eventId={eventId}
        manage={manage}
        symbol={symbol}
        refundAfterStart={event.optionsRefundAfterStart}
        rows={options.map((o) => ({
          id: o.id,
          name: o.name,
          description: o.description ?? "",
          price: formatMoney(o.priceMinor, event.currency, locale, {
            trimZeroCents: true,
          }),
          priceMinor: o.priceMinor,
          sold: o.sold,
          stock: o.stock ?? null,
          redeemed: o.redeemed,
          maxPerOrder: o.maxPerOrder,
          active: o.active,
          initial: {
            id: o.id,
            name: o.name,
            description: o.description ?? "",
            price: (o.priceMinor / 100).toFixed(2),
            stock: o.stock?.toString() ?? "",
            maxPerOrder: String(o.maxPerOrder),
            standalone: o.standalone,
          },
        }))}
      />
    </div>
  );
}
