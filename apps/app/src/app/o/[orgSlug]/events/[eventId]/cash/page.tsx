import { can } from "@evoly/core";
import { BarActions } from "@/components/shell/EventTabs";
import { buttonClass } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/Controls";
import { DownloadIcon } from "@/components/ui/icons";
import { formatMoney, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { findEvent } from "@/server/events";
import { cashHandOver, cashReport } from "@/server/boxOffice";
import { db } from "@/lib/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("cash") };
}

export default async function EventCashPage({
  params,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const canManage = can(ctx.membership, "CHECKIN_MANAGE");
  const canScan = can(ctx.membership, "CHECKIN_SCAN");
  if (!canManage && !canScan && !can(ctx.membership, "STATS_VIEW")) notFound();
  await findEvent(ctx, eventId); // l'événement de l'organisation, sinon page introuvable
  const t = await getTranslations("entries");
  // section 9.27 : rapport de caisse des ventes sur place
  const cashCtx = await requireOrgContext((await params).orgSlug);
  const cash = await cashReport(cashCtx, (await params).eventId);
  const cashCurrency = (
    await db.event.findUniqueOrThrow({
      where: { id: (await params).eventId },
      select: { currency: true },
    })
  ).currency;
  const cashLocale = (await getLocale()) as Locale;
  const eid = (await params).eventId;
  const row =
    "flex flex-wrap justify-between gap-3 border-b border-line py-[9px]";
  // refonte A3 : l'export à droite des onglets en boutons (BarActions), les ventes et la remise de caisse en rangées
  // entre des filets, sous des titres de section
  if (!cash.length)
    return <EmptyState title={(await getTranslations("nav"))("cashEmpty")} />;
  return (
    <>
      <BarActions>
        <a
          href={`/o/${cashCtx.organization.slug}/events/${eid}/caisse.csv`}
          className={buttonClass("secondary")}
        >
          <DownloadIcon />
          {t("cashExport")}
        </a>
      </BarActions>
      <div className="grid gap-6">
        <section aria-labelledby="cash-title">
          <SectionTitle id="cash-title" title={t("cashTitle")} />
          <ul role="list">
            {cash.map((c) => (
              <li key={`${c.label}-${c.device}-${c.mode}`} className={row}>
                <span>
                  {c.label} ·{" "}
                  {c.mode === "CASH" ? t("cashModeCash") : t("cashModeQr")}
                  {c.device
                    ? ` · ${t("cashDevice", { device: c.device })}`
                    : ""}
                </span>
                <span className="tabular-nums">
                  {t("cashLine", { sales: c.sales })} ·{" "}
                  {formatMoney(c.amountMinor, cashCurrency, cashLocale, {
                    trimZeroCents: true,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="cash-handover">
          <SectionTitle id="cash-handover" title={t("cashHandOver")} />
          <ul role="list">
            {cashHandOver(cash).map((h) => (
              <li key={`${h.label}-${h.device}`} className={row}>
                <span>
                  {h.label}
                  {h.device
                    ? ` · ${t("cashDevice", { device: h.device })}`
                    : ""}
                </span>
                <span className="font-semibold tabular-nums">
                  {formatMoney(h.amountMinor, cashCurrency, cashLocale, {
                    trimZeroCents: true,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
