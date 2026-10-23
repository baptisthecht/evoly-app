import { can } from "@evoly/core";
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
  const event = await findEvent(ctx, eventId);
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
  return (
    <div className="grid gap-6">
      {cash.length ? (
        <section
          className="grid gap-2 rounded-lg bg-surface-sunken p-4 text-sm"
          aria-label={t("cashTitle")}
        >
          <h2 className="flex flex-wrap items-baseline justify-between gap-2 font-semibold">
            {t("cashTitle")}
            <a
              href={`/o/${cashCtx.organization.slug}/events/${(await params).eventId}/caisse.csv`}
              className="text-sm font-normal underline underline-offset-4"
            >
              {t("cashExport")}
            </a>
          </h2>
          {cash.map((c) => (
            <p
              key={`${c.label}-${c.device}-${c.mode}`}
              className="flex flex-wrap justify-between gap-3"
            >
              <span>
                {c.label} ·{" "}
                {c.mode === "CASH" ? t("cashModeCash") : t("cashModeQr")}
                {c.device ? ` · ${t("cashDevice", { device: c.device })}` : ""}
              </span>
              <span className="tabular-nums">
                {t("cashLine", { sales: c.sales })} ·{" "}
                {formatMoney(c.amountMinor, cashCurrency, cashLocale, {
                  trimZeroCents: true,
                })}
              </span>
            </p>
          ))}
          <h3 className="mt-2 font-semibold">{t("cashHandOver")}</h3>
          {cashHandOver(cash).map((h) => (
            <p
              key={`${h.label}-${h.device}`}
              className="flex flex-wrap justify-between gap-3"
            >
              <span>
                {h.label}
                {h.device ? ` · ${t("cashDevice", { device: h.device })}` : ""}
              </span>
              <span className="font-semibold tabular-nums">
                {formatMoney(h.amountMinor, cashCurrency, cashLocale, {
                  trimZeroCents: true,
                })}
              </span>
            </p>
          ))}
        </section>
      ) : (
        <p className="text-sm text-ink-muted">
          {(await getTranslations("nav"))("cashEmpty")}
        </p>
      )}
    </div>
  );
}
