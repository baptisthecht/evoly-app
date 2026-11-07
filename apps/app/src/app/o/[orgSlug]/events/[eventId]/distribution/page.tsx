import { can, hasFeature } from "@evoly/core";
import type { Metadata } from "next";
import Link from "next/link";
import { formatMoney, type Locale } from "@evoly/i18n";
import { getLocale, getTranslations } from "next-intl/server";
import { ProLocked } from "@/components/ProLocked";
import { BarActions } from "@/components/shell/EventTabs";
import { buttonClass } from "@/components/ui/Button";
import { SectionTitle } from "@/components/ui/Controls";
import { DownloadIcon } from "@/components/ui/icons";
import { requireOrgContext } from "@/server/context";
import {
  DISTRIBUTOR_KINDS,
  eventChannelReport,
  eventDistribution,
} from "@/server/distributors";
import { getEventWithTickets } from "@/server/events";
import { listImportBatches } from "@/server/externalImport";
import {
  AddDistributorForm,
  AllocationForm,
  PrecreatedCodesForm,
  ReleaseUnsoldButton,
} from "./DistributionForms";
import { ImportHistory } from "./ImportHistory";
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
      <div className="grid gap-3.5">
        <p className="max-w-[720px] text-[13px] text-ink-muted">{t("intro")}</p>
        <ProLocked
          orgSlug={orgSlug}
          feature="DISTRIBUTION"
          canUpgrade={can(ctx.membership, "BILLING_MANAGE")}
        />
      </div>
    );
  }
  const [data, report, batches] = await Promise.all([
    eventDistribution(ctx, eventId),
    eventChannelReport(ctx, eventId),
    listImportBatches(ctx, eventId),
  ]);
  const locale = (await getLocale()) as Locale;
  const canEdit = can(ctx.membership, "EVENTS_EDIT");
  // refonte A3 : l'export à droite des onglets en boutons (BarActions), le bilan en tableau comme Finances (en-têtes
  // gris de 12,5 px, filets, le total sous un trait charbon), puis les réseaux en rangées
  const th =
    "border-b border-line px-2.5 py-[7px] text-[12.5px] leading-[normal] font-medium whitespace-nowrap text-ink-muted";
  const td = "border-b border-line p-2.5 tabular-nums";
  return (
    <>
      {canEdit ? (
        <BarActions>
          <a
            href={`/o/${orgSlug}/events/${eventId}/distribution/bilan`}
            className={buttonClass("secondary")}
          >
            <DownloadIcon />
            {t("exportCsv")}
          </a>
        </BarActions>
      ) : null}
      <div className="grid gap-6">
        <p className="max-w-[720px] text-[13px] text-ink-muted">{t("intro")}</p>
        <section aria-labelledby="report-title">
          <SectionTitle id="report-title" title={t("reportTitle")} />
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr>
                  <th scope="col" className={`${th} text-left`}>
                    {t("colChannel")}
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    {t("colTickets")}
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    {t("colEntered")}
                  </th>
                  <th scope="col" className={`${th} text-right`}>
                    {t("colRevenue")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={`${r.channel}-${r.name ?? ""}`}>
                    <th scope="row" className={`${td} font-medium`}>
                      {r.channel === "NETWORK"
                        ? r.name
                        : t(`channel_${r.channel}`)}
                    </th>
                    <td className={`${td} text-right`}>{r.tickets}</td>
                    <td className={`${td} text-right`}>{r.entered}</td>
                    <td className={`${td} text-right`}>
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
                <tr className="font-semibold [&>*]:border-t-[1.5px] [&>*]:border-b-0 [&>*]:border-t-ink-strong">
                  <th scope="row" className={td}>
                    {t("total")}
                  </th>
                  <td className={`${td} text-right`}>{report.total.tickets}</td>
                  <td className={`${td} text-right`}>{report.total.entered}</td>
                  <td className={td} />
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section aria-labelledby="networks-title" className="grid gap-3">
          <SectionTitle
            id="networks-title"
            title={t("networksTitle")}
            className="mb-0"
          />
          {data.distributors.length === 0 ? (
            <p className="text-[13px] text-ink-muted">{t("empty")}</p>
          ) : (
            <ul role="list">
              {data.distributors.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-wrap items-center justify-between gap-4 border-b border-line py-3"
                >
                  <div className="grid min-w-0 gap-0.5">
                    <span className="font-medium">{d.name}</span>
                    <span className="text-[13px] text-ink-muted">
                      {t(`kind_${d.kind}`)}
                    </span>
                  </div>
                  <dl className="flex flex-wrap gap-6 text-[13px]">
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
                            ): x is {
                              id: string;
                              name: string;
                              free: number;
                            } => !!x && x.free > 0,
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
        </section>

        {batches.length ? (
          <section aria-labelledby="history-title">
            <SectionTitle id="history-title" title={t("historyTitle")} />

            <ImportHistory
              orgSlug={orgSlug}

              eventId={eventId}

              batches={batches.map((b) => ({
                id: b.id,

                distributor: b.distributor,

                fileName: b.fileName,

                createdAt: b.createdAt.toISOString(),

                createdBy: b.createdBy,

                status: b.status,

                created: b.report?.created ?? b.tickets,

                deletedAt: b.deletedAt?.toISOString() ?? null,

                deletedCount: b.deletedCount,

                keptEntered: b.keptEntered,
              }))}
            />
          </section>
        ) : null}

        {data.distributors.length === 0 ? null : data.seated ? (
          <section aria-labelledby="seats-title" className="grid gap-2">
            <SectionTitle
              id="seats-title"
              title={t("seatsTitle")}
              className="mb-0"
            />
            <p className="max-w-[720px] text-[13px] text-ink-muted">
              {t("seatsBody")}
            </p>
            <div>
              <Link
                href={`/o/${orgSlug}/events/${eventId}/seating`}
                className={buttonClass("secondary")}
              >
                {t("seatsLink")}
              </Link>
            </div>
          </section>
        ) : (
          <section aria-labelledby="alloc-title" className="grid gap-4">
            <div>
              <SectionTitle
                id="alloc-title"
                title={t("allocationsTitle")}
                className="mb-0.5"
              />
              <p className="max-w-[720px] text-[13px] text-ink-muted">
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
                  <h3 id={`alloc-${tt.id}`} className="font-medium">
                    {tt.name}
                  </h3>
                  <span className="text-[13px] text-ink-muted">
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
          </section>
        )}
      </div>
    </>
  );
}
