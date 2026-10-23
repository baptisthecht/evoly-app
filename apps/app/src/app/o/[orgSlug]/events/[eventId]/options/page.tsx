import { can, hasFeature } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { ProLocked } from "@/components/ProLocked";
import { Badge, Card, EmptyState } from "@/components/ui/Card";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { listOptions } from "@/server/options";
import { OptionCommand, OptionForm } from "./OptionForm";
import { OptionsRefundPolicy } from "./OptionsRefundPolicy";

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
      {options.length === 0 ? (
        <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState>
      ) : null}
      <ul className="grid gap-3">
        {options.map((o) => (
          <li key={o.id}>
            <Card className="grid gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid min-w-0 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{o.name}</p>
                    <Badge tone={o.active ? "success" : "neutral"}>
                      {o.active ? t("active") : t("inactive")}
                    </Badge>
                  </div>
                  <p className="text-sm text-ink-muted">
                    {formatMoney(o.priceMinor, event.currency, locale, {
                      trimZeroCents: true,
                    })}{" "}
                    · {t("sold", { count: o.sold })}
                    {o.stock != null
                      ? ` ${t("stockOf", { stock: o.stock })}`
                      : ` (${t("unlimited")})`}{" "}
                    · {t("redeemed", { count: o.redeemed })} ·{" "}
                    {t("perOrder", { max: o.maxPerOrder })}
                  </p>
                  {o.description ? (
                    <p className="text-sm">{o.description}</p>
                  ) : null}
                </div>
                {manage ? (
                  <OptionCommand
                    orgSlug={orgSlug}
                    eventId={eventId}
                    optionId={o.id}
                    command={o.active ? "deactivate" : "activate"}
                    label={o.active ? t("deactivate") : t("activate")}
                  />
                ) : null}
              </div>
              {manage ? (
                <details>
                  <summary className="cursor-pointer text-sm">
                    {t("edit")}
                  </summary>
                  <OptionForm
                    orgSlug={orgSlug}
                    eventId={eventId}
                    symbol={symbol}
                    option={{
                      id: o.id,
                      name: o.name,
                      description: o.description ?? "",
                      price: (o.priceMinor / 100).toFixed(2),
                      stock: o.stock?.toString() ?? "",
                      maxPerOrder: String(o.maxPerOrder),
                      standalone: o.standalone,
                    }}
                  />
                </details>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
      {manage ? (
        <OptionsRefundPolicy
          orgSlug={orgSlug}
          eventId={eventId}
          allowed={event.optionsRefundAfterStart}
        />
      ) : null}
      {manage ? (
        <OptionForm orgSlug={orgSlug} eventId={eventId} symbol={symbol} />
      ) : null}
    </div>
  );
}
