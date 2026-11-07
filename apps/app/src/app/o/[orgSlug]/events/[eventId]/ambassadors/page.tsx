import { can, hasFeature } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CopyButton } from "@/components/CopyButton";
import { ProLocked } from "@/components/ProLocked";
import { BarActions } from "@/components/shell/EventTabs";
import { buttonClass } from "@/components/ui/Button";
import { ButtonTabs } from "@/components/ui/ButtonTabs";
import { Badge, EmptyState } from "@/components/ui/Card";
import { DownloadIcon } from "@/components/ui/icons";
import {
  listAmbassadors,
  organizationAmbassadorRanking,
} from "@/server/ambassadors";
import { requireOrgContext } from "@/server/context";
import { getEventWithTickets } from "@/server/events";
import {
  AmbassadorCommand,
  AmbassadorPromoForm,
  AmbassadorForm,
} from "./AmbassadorForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("events");
  return { title: t("tabAmbassadors") };
}

/** Ambassadeurs de l'événement : liens de vente, classement, export (section 9.28, Pro). */
export default async function AmbassadorsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
  searchParams: Promise<{ portee?: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const event = await getEventWithTickets(ctx, eventId);
  const t = await getTranslations("ambassadors");
  if (!hasFeature(ctx.features, "AMBASSADORS")) {
    return (
      <div className="grid gap-3.5">
        <p className="max-w-[720px] text-[13px] text-ink-muted">{t("intro")}</p>
        <ProLocked
          orgSlug={orgSlug}
          feature="AMBASSADORS"
          canUpgrade={can(ctx.membership, "BILLING_MANAGE")}
        />
      </div>
    );
  }
  const rows = await listAmbassadors(ctx, eventId);
  const locale = (await getLocale()) as Locale;
  const manage = can(ctx.membership, "PROMO_MANAGE") && !ctx.readOnly;
  // classement : cet événement, ou toute l'organisation (RG-AMB-05)
  const scope =
    (await searchParams).portee === "organisation" ? "org" : "event";
  const base = `/o/${orgSlug}/events/${eventId}/ambassadors`;
  // refonte A3 : la portée du classement en choix segmenté (« .seg »), comme les onglets en boutons
  const orgHref = `${base}?portee=organisation`;
  const nav = (
    <ButtonTabs
      label={t("scopeLabel")}
      items={[
        { href: base, label: t("scopeEvent") },
        { href: orgHref, label: t("scopeOrg") },
      ]}
      current={scope === "org" ? orgHref : base}
    />
  );
  const intro = (
    <p className="max-w-[720px] text-[13px] text-ink-muted">{t("intro")}</p>
  );
  const td = "border-b border-line p-2.5 align-middle";
  if (scope === "org") {
    const people = await organizationAmbassadorRanking(ctx);
    return (
      <div className="grid gap-3.5">
        {intro}
        <div>{nav}</div>
        <p className="text-[13px] text-ink-muted">{t("orgHint")}</p>
        {people.length === 0 ? (
          <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState>
        ) : (
          // le classement en tableau (refonte A3) : rang, nom et événements, billets, montant
          <table className="w-full border-collapse">
            <tbody>
              {people.map((p, i) => (
                <tr key={p.key}>
                  <td
                    className={`${td} w-10 text-[13px] text-ink-muted tabular-nums`}
                  >
                    {i + 1}
                  </td>
                  <td className={td}>
                    <b className="block font-medium">{p.name}</b>
                    <small className="text-[12.5px] text-ink-muted">
                      {t("orgEvents", { count: p.events })}
                    </small>
                  </td>
                  <td
                    className={`${td} text-right whitespace-nowrap tabular-nums`}
                  >
                    {t("tickets", { count: p.tickets })}
                  </td>
                  <td
                    className={`${td} w-32 text-right whitespace-nowrap tabular-nums`}
                  >
                    {formatMoney(
                      p.amountMinor,
                      ctx.organization.currency,
                      locale,
                      {
                        trimZeroCents: true,
                      },
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }
  return (
    <>
      {rows.length > 0 ? (
        <BarActions>
          <a
            href={`/o/${orgSlug}/events/${eventId}/ambassadors/export`}
            className={buttonClass("secondary")}
          >
            <DownloadIcon />
            {t("export")}
          </a>
        </BarActions>
      ) : null}
      <div className="grid gap-3.5">
        {intro}
        <div>{nav}</div>
        {rows.length === 0 ? (
          <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState>
        ) : null}
        {/* un ambassadeur par rangée, séparées par des filets (refonte A3) */}
        <ol>
          {rows.map((a, i) => (
            <li key={a.id} className="border-b border-line py-3.5">
              <div className="grid gap-2.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid min-w-0 gap-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] text-ink-muted tabular-nums">
                        {i + 1}
                      </span>
                      <p className="font-semibold">{a.name}</p>
                      <Badge tone={a.active ? "success" : "neutral"}>
                        {a.active ? t("active") : t("inactive")}
                      </Badge>
                    </div>
                    <p className="text-[13px] text-ink-muted">
                      {t("tickets", { count: a.tickets })} ·{" "}
                      {formatMoney(a.amountMinor, event.currency, locale, {
                        trimZeroCents: true,
                      })}
                      {a.goal
                        ? ` · ${t("goalProgress", { tickets: a.tickets, goal: a.goal })}`
                        : ""}
                      {a.reward
                        ? ` · ${t("rewardLabel", { reward: a.reward })}`
                        : ""}
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
                <div className="grid gap-2 text-[13px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t("saleLink")}</span>
                    <code className="min-w-0 rounded-[6px] bg-surface-sunken px-2 py-0.5 font-sans break-all">
                      {a.saleUrl}
                    </code>
                    <CopyButton value={a.saleUrl} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{t("statsLink")}</span>
                    <CopyButton value={a.statsUrl} label={t("copyStats")} />
                  </div>
                  {a.promo ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{t("promoLabel")}</span>
                      <code className="rounded-[6px] bg-surface-sunken px-2 py-0.5 font-sans">
                        {a.promo.code}
                      </code>
                      <span>
                        {a.promo.percentOffBps != null
                          ? `−${a.promo.percentOffBps / 100} %`
                          : `−${formatMoney(a.promo.amountOffMinor ?? 0, event.currency, locale, { trimZeroCents: true })}`}
                      </span>
                      {!a.promo.isActive ? (
                        <Badge tone="neutral">{t("inactive")}</Badge>
                      ) : null}
                      {manage ? (
                        <AmbassadorCommand
                          orgSlug={orgSlug}
                          eventId={eventId}
                          id={a.id}
                          command="removePromo"
                          label={t("promoRemove")}
                        />
                      ) : null}
                    </div>
                  ) : manage ? (
                    <AmbassadorPromoForm
                      orgSlug={orgSlug}
                      eventId={eventId}
                      id={a.id}
                      code={a.code.toUpperCase()}
                    />
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
        {manage ? <AmbassadorForm orgSlug={orgSlug} eventId={eventId} /> : null}
      </div>
    </>
  );
}
