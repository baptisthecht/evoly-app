import { can, hasFeature } from "@evoly/core";
import { formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { CopyButton } from "@/components/CopyButton";
import { ProLocked } from "@/components/ProLocked";
import { Badge, Card, EmptyState } from "@/components/ui/Card";
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
      <div className="grid gap-4">
        <p className="text-ink-muted">{t("intro")}</p>
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
  const tab = (active: boolean) =>
    `rounded-full px-4 py-2 ${active ? "bg-[var(--evoly-charbon)] text-[var(--evoly-creme)]" : "ring-1 ring-current"}`;
  const nav = (
    <nav
      aria-label={t("scopeLabel")}
      className="flex flex-wrap gap-2 text-sm font-semibold"
    >
      <a
        href={base}
        aria-current={scope === "event" ? "page" : undefined}
        className={tab(scope === "event")}
      >
        {t("scopeEvent")}
      </a>
      <a
        href={`${base}?portee=organisation`}
        aria-current={scope === "org" ? "page" : undefined}
        className={tab(scope === "org")}
      >
        {t("scopeOrg")}
      </a>
    </nav>
  );
  if (scope === "org") {
    const people = await organizationAmbassadorRanking(ctx);
    return (
      <div className="grid gap-4">
        <p className="text-ink-muted">{t("intro")}</p>
        {nav}
        <p className="text-sm text-ink-muted">{t("orgHint")}</p>
        {people.length === 0 ? (
          <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState>
        ) : null}
        <ol className="grid gap-3">
          {people.map((p, i) => (
            <li key={p.key}>
              <Card className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {i + 1}. {p.name}
                  </p>
                  <p className="text-sm text-ink-muted">
                    {t("orgEvents", { count: p.events })}
                  </p>
                </div>
                <p className="tabular-nums">
                  {t("tickets", { count: p.tickets })} ·{" "}
                  {formatMoney(
                    p.amountMinor,
                    ctx.organization.currency,
                    locale,
                    { trimZeroCents: true },
                  )}
                </p>
              </Card>
            </li>
          ))}
        </ol>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      <p className="text-ink-muted">{t("intro")}</p>
      {nav}
      {rows.length === 0 ? (
        <EmptyState title={t("emptyTitle")}>{t("emptyBody")}</EmptyState>
      ) : null}
      {rows.length > 0 ? (
        <a
          href={`/o/${orgSlug}/events/${eventId}/ambassadors/export`}
          className="justify-self-start text-sm font-semibold underline underline-offset-4"
        >
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
                    <span className="font-display text-lg tabular-nums">
                      #{i + 1}
                    </span>
                    <p className="font-semibold">{a.name}</p>
                    <Badge tone={a.active ? "success" : "neutral"}>
                      {a.active ? t("active") : t("inactive")}
                    </Badge>
                  </div>
                  <p className="text-sm text-ink-muted">
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
              <div className="grid gap-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{t("saleLink")}</span>
                  <code className="min-w-0 break-all rounded bg-surface-sunken px-2 py-1">
                    {a.saleUrl}
                  </code>
                  <CopyButton value={a.saleUrl} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{t("statsLink")}</span>
                  <CopyButton value={a.statsUrl} label={t("copyStats")} />
                </div>
                {a.promo ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{t("promoLabel")}</span>
                    <code className="rounded bg-surface-sunken px-2 py-1">
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
            </Card>
          </li>
        ))}
      </ol>
      {manage ? <AmbassadorForm orgSlug={orgSlug} eventId={eventId} /> : null}
    </div>
  );
}
