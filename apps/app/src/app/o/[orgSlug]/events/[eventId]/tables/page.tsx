import { can, hasFeature } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ProLocked } from "@/components/ProLocked";
import { Card, EmptyState } from "@/components/ui/Card";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { tableSettings } from "@/server/tables";
import { TableForm } from "./TableForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("tabTables") };
}

/** Tables et forfaits (section 9.31, Pro) : un tarif peut donner plusieurs billets par achat, avec consommations comprises. */
export default async function TablesPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await getEventWithTickets(ctx, eventId);
  const t = await getTranslations("tables");
  if (!hasFeature(ctx.features, "SEATING_MAPS")) {
    return (
      <div className="grid gap-4">
        <p className="text-ink-muted">{t("intro")}</p>
        <ProLocked
          orgSlug={orgSlug}
          feature="SEATING_MAPS"
          canUpgrade={can(ctx.membership, "BILLING_MANAGE")}
        />
      </div>
    );
  }
  const { types, options } = await tableSettings(ctx, eventId);
  const locale = (await getLocale()) as Locale;
  const manage = can(ctx.membership, "TICKETS_MANAGE") && !ctx.readOnly;
  return (
    <div className="grid gap-4">
      <p className="text-ink-muted">{t("intro")}</p>
      {types.length === 0 ? (
        <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState>
      ) : null}
      {types.map((tt) => (
        <Card key={tt.id} className="grid gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl">{tt.name}</h2>
            <p className="text-sm text-ink-muted">
              {formatMoney(tt.priceMinor, event.currency, locale, {
                trimZeroCents: true,
              })}
              {tt.groupSize > 1
                ? ` · ${t("perPerson", { amount: formatMoney(Math.round(tt.priceMinor / tt.groupSize), event.currency, locale, { trimZeroCents: true }), count: tt.groupSize })}`
                : ""}
            </p>
          </div>
          {manage ? (
            <TableForm
              orgSlug={orgSlug}
              eventId={eventId}
              type={tt}
              options={options}
            />
          ) : null}
        </Card>
      ))}
    </div>
  );
}
