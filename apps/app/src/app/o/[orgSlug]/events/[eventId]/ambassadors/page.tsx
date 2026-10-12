import { can, hasFeature } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CopyButton } from "@/components/CopyButton";
import { ProLocked } from "@/components/ProLocked";
import { Badge, Card, EmptyState } from "@/components/ui/Card";
import { listAmbassadors } from "@/server/ambassadors";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import { AmbassadorCommand, AmbassadorForm } from "./AmbassadorForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("tabAmbassadors") };
}

/** Ambassadeurs de l'événement : liens de vente, classement, export (section 9.28, Pro). */
export default async function AmbassadorsPage({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await getEventWithTickets(ctx, eventId);
  const t = await getTranslations("ambassadors");
  if (!hasFeature(ctx.features, "AMBASSADORS")) {
    return (
      <div className="grid max-w-4xl gap-4">
        <p className="text-ink-muted">{t("intro")}</p>
        <ProLocked orgSlug={orgSlug} feature="AMBASSADORS" canUpgrade={can(ctx.membership, "BILLING_MANAGE")} />
      </div>
    );
  }
  const rows = await listAmbassadors(ctx, eventId);
  const locale = (await getLocale()) as Locale;
  const manage = can(ctx.membership, "PROMO_MANAGE") && !ctx.readOnly;
  return (
    <div className="grid max-w-4xl gap-4">
      <p className="text-ink-muted">{t("intro")}</p>
      {rows.length === 0 ? <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState> : null}
      {rows.length > 0 ? (
        <a href={`/o/${orgSlug}/events/${eventId}/ambassadors/export`} className="justify-self-start text-sm font-semibold underline underline-offset-4">
          {t("export")}
        </a>
      ) : null}
      <ol className="grid gap-3">
        {rows.map((a, i) => (
          <li key={a.id}>
            <Card className="grid gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid min-w-0 gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg tabular-nums">#{i + 1}</span>
                    <p className="font-semibold">{a.name}</p>
                    <Badge tone={a.active ? "success" : "neutral"}>{a.active ? t("active") : t("inactive")}</Badge>
                  </div>
                  <p className="text-sm text-ink-muted">
                    {t("tickets", { count: a.tickets })} · {formatMoney(a.amountMinor, event.currency, locale, { trimZeroCents: true })}
                    {a.goal ? ` · ${t("goalProgress", { tickets: a.tickets, goal: a.goal })}` : ""}
                    {a.reward ? ` · ${t("rewardLabel", { reward: a.reward })}` : ""}
                  </p>
                </div>
                {manage ? (
                  <AmbassadorCommand
                    orgSlug={orgSlug}
                    eventId={eventId}
                    id={a.id}
                    command={a.active ? "deactivate" : "activate"}
                    label={a.active ? t("deactivate") : t("activate")}
                  />
                ) : null}
              </div>
              <div className="grid gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{t("saleLink")}</span>
                  <code className="min-w-0 break-all rounded bg-surface-sunken px-2 py-1">{a.saleUrl}</code>
                  <CopyButton value={a.saleUrl} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{t("statsLink")}</span>
                  <CopyButton value={a.statsUrl} label={t("copyStats")} />
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ol>
      {manage ? <AmbassadorForm orgSlug={orgSlug} eventId={eventId} /> : null}
    </div>
  );
}
