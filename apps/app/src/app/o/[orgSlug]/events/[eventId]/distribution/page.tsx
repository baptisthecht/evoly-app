import { can, hasFeature } from "@evoly/core";
import type { Metadata } from "next";
import Link from "next/link";
import { formatMoney, type Locale } from "@evoly/i18n";
import { getLocale, getTranslations } from "next-intl/server";
import { ProLocked } from "@/components/ProLocked";
import { Card } from "@/components/ui/Card";
import { requireOrgContext } from "@/server/context";
import {
  DISTRIBUTOR_KINDS,
  eventChannelReport,
  eventDistribution,
} from "@/server/distributors";
import { getEventWithTickets } from "@/server/events";
import {
  AddDistributorForm,
  AllocationForm,
  PrecreatedCodesForm,
  ReleaseUnsoldButton,
} from "./DistributionForms";
import { ImportPanel } from "./ImportPanel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("distribution") };
}

/** Réseaux de vente d'un événement : contingents par tarif ou places du plan, bilan par réseau (docs/COMPATIBILITE_RESEAUX.md, Pro). */
export default async function DistributionPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await getEventWithTickets(ctx, eventId);
  const t = await getTranslations("distribution");
  if (!hasFeature(ctx.features, "DISTRIBUTION")) {
    return (
      <div className="grid gap-4">
        <p className="text-ink-muted">{t("intro")}</p>
        <ProLocked
          orgSlug={orgSlug}
          feature="DISTRIBUTION"
          canUpgrade={can(ctx.membership, "BILLING_MANAGE")}
        />
      </div>
    );
  }
  const [data, report] = await Promise.all([
    eventDistribution(ctx, eventId),
    eventChannelReport(ctx, eventId),
  ]);
  const locale = (await getLocale()) as Locale;
  const canEdit = can(ctx.membership, "EVENTS_EDIT");
  return (
    <div className="grid gap-6">
      <p className="max-w-prose text-ink-muted">{t("intro")}</p>
      <Card className="grid gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-display text-xl">{t("reportTitle")}</h2>
          {canEdit ? (
            <a
              href={`/o/${orgSlug}/events/${eventId}/distribution/bilan`}
              className="text-sm font-semibold underline underline-offset-4"
            >
              {t("exportCsv")}
            </a>
          ) : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-ink-muted">
                <th scope="col" className="py-2 pr-4 font-normal">
                  {t("colChannel")}
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">
                  {t("colTickets")}
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">
                  {t("colEntered")}
                </th>
                <th scope="col" className="py-2 text-right font-normal">
                  {t("colRevenue")}
                </th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr
                  key={`${r.channel}-${r.name ?? ""}`}
                  className="border-t border-line"
                >
                  <th scope="row" className="py-2 pr-4 font-semibold">
                    {r.channel === "NETWORK"
                      ? r.name
                      : t(`channel_${r.channel}`)}
                  </th>
                  <td className="py-2 pr-4 text-right">{r.tickets}</td>
                  <td className="py-2 pr-4 text-right">{r.entered}</td>
                  <td className="py-2 text-right">
                    {r.declaredRevenueMinor == null
                      ? ""
                      : formatMoney(
                          r.declaredRevenueMinor,
                          event.currency,
                          locale,
                        )}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-line font-semibold">
                <th scope="row" className="py-2 pr-4">
                  {t("total")}
                </th>
                <td className="py-2 pr-4 text-right">{report.total.tickets}</td>
                <td className="py-2 pr-4 text-right">{report.total.entered}</td>
                <td className="py-2" />
              </tr>
            </tbody>
          </table>
        </div>
      </Card>
      <Card className="grid gap-4">
        <h2 className="font-display text-xl">{t("networksTitle")}</h2>
        {data.distributors.length === 0 ? (
          <p className="text-ink-muted">{t("empty")}</p>
        ) : (
          <ul className="grid gap-3">
            {data.distributors.map((d) => (
              <li
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-surface-sunken p-4"
              >
                <div className="grid min-w-0 gap-0.5">
                  <span className="font-semibold">{d.name}</span>
                  <span className="text-sm text-ink-muted">
                    {t(`kind_${d.kind}`)}
                  </span>
                </div>
                <dl className="flex flex-wrap gap-6 text-sm">
                  <div className="grid">
                    <dt className="text-ink-muted">{t("allocated")}</dt>
                    <dd className="font-semibold">{d.allocated}</dd>
                  </div>
                  <div className="grid">
                    <dt className="text-ink-muted">{t("imported")}</dt>
                    <dd className="font-semibold">{d.imported}</dd>
                  </div>
                  <div className="grid">
                    <dt className="text-ink-muted">{t("entered")}</dt>
                    <dd className="font-semibold">{d.entered}</dd>
                  </div>
                </dl>
                {canEdit && d.allocated > d.imported ? (
                  <ReleaseUnsoldButton
                    orgSlug={orgSlug}
                    eventId={eventId}
                    distributorId={d.id}
                    count={d.allocated - d.imported}
                  />
                ) : null}
                {canEdit ? (
                  <ImportPanel
                    orgSlug={orgSlug}
                    eventId={eventId}
                    distributorId={d.id}
                  />
                ) : null}
                {canEdit && !data.seated
                  ? (() => {
                      // codes créés à l'avance : seulement sur les tarifs confiés à ce réseau, dans la limite des places libres
                      const types = data.ticketTypes
                        .map((tt) => {
                          const a = tt.allocations.find(
                            (x) => x.distributorId === d.id,
                          );
                          return a
                            ? {
                                id: tt.id,
                                name: tt.name,
                                free: a.quantity - a.imported,
                              }
                            : null;
                        })
                        .filter(
                          (
                            x,
                          ): x is { id: string; name: string; free: number } =>
                            !!x && x.free > 0,
                        );
                      return types.length || d.precreated ? (
                        <PrecreatedCodesForm
                          orgSlug={orgSlug}
                          eventId={eventId}
                          distributorId={d.id}
                          ticketTypes={types}
                          existing={d.precreated}
                        />
                      ) : null;
                    })()
                  : null}
              </li>
            ))}
          </ul>
        )}
        {canEdit ? (
          <AddDistributorForm
            orgSlug={orgSlug}
            eventId={eventId}
            kinds={DISTRIBUTOR_KINDS.map((k) => ({
              value: k,
              label: t(`kind_${k}`),
            }))}
          />
        ) : null}
      </Card>

      {data.distributors.length === 0 ? null : data.seated ? (
        <Card className="grid gap-3">
          <h2 className="font-display text-xl">{t("seatsTitle")}</h2>
          <p className="max-w-prose text-ink-muted">{t("seatsBody")}</p>
          <div>
            <Link
              href={`/o/${orgSlug}/events/${eventId}/seating`}
              className="font-semibold underline underline-offset-4"
            >
              {t("seatsLink")}
            </Link>
          </div>
        </Card>
      ) : (
        <Card className="grid gap-5">
          <div className="grid gap-1">
            <h2 className="font-display text-xl">{t("allocationsTitle")}</h2>
            <p className="max-w-prose text-sm text-ink-muted">
              {t("allocationsHint")}
            </p>
          </div>
          {data.ticketTypes.map((tt) => (
            <section
              key={tt.id}
              aria-labelledby={`alloc-${tt.id}`}
              className="grid gap-3 border-t border-line pt-5 first-of-type:border-t-0 first-of-type:pt-0"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 id={`alloc-${tt.id}`} className="font-semibold">
                  {tt.name}
                </h3>
                <span className="text-sm text-ink-muted">
                  {tt.onlineLeft == null
                    ? t("onlineUnlimited")
                    : t("onlineLeft", { count: tt.onlineLeft })}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {data.distributors.map((d) => {
                  const a = tt.allocations.find(
                    (x) => x.distributorId === d.id,
                  );
                  return (
                    <AllocationForm
                      key={d.id}
                      orgSlug={orgSlug}
                      eventId={eventId}
                      ticketTypeId={tt.id}
                      distributorId={d.id}
                      distributorName={d.name}
                      quantity={a?.quantity ?? 0}
                      imported={a?.imported ?? 0}
                      disabled={!canEdit}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </Card>
      )}
    </div>
  );
}
