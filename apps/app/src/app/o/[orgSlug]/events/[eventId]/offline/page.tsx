import { can } from "@evoly/core";
import { formatDateTime, type Locale } from "@evoly/i18n";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOrgContext } from "@/server/context";
import { findEvent } from "@/server/events";
import { optionConflicts } from "@/server/options";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("offline") };
}

export default async function EventOfflinePage({ params }: { params: Promise<{ orgSlug: string; eventId: string }> }) {
  const { orgSlug, eventId } = await params;
  const ctx = await requireOrgContext(orgSlug);
  const canManage = can(ctx.membership, "CHECKIN_MANAGE");
  const canScan = can(ctx.membership, "CHECKIN_SCAN");
  if (!canManage && !canScan && !can(ctx.membership, "STATS_VIEW")) notFound();
  const event = await findEvent(ctx, eventId);
  const t = await getTranslations("entries");
  // section 9.27 : rapport de caisse des ventes sur place
  const cashCtx = await requireOrgContext((await params).orgSlug);
  const conflicts = await optionConflicts(cashCtx, (await params).eventId); // RG-OPT-05
  const cashLocale = (await getLocale()) as Locale;
  return (
    <div className="grid max-w-5xl gap-6">
      {conflicts.length > 0 ? (
        <section className="grid gap-2 rounded-2xl bg-surface-raised p-4 ring-1 ring-danger" aria-label={t("conflictsTitle")}>
          <h2 className="font-semibold">{t("conflictsTitle")}</h2>
          <p className="text-sm text-ink-muted">{t("conflictsHint")}</p>
          <ul className="grid gap-1 text-sm">
            {conflicts.map((c) => (
              <li key={c.id}>
                {formatDateTime(c.happenedAt, event.timezone, cashLocale, "short")} ·{" "}
                {t("conflictLine", { option: c.line.option.name, reference: c.line.order.reference, refused: c.refused, requested: c.requested })}
                {c.staffName ? ` · ${c.staffName}` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="text-sm text-ink-muted">{(await getTranslations("nav"))("offlineEmpty")}</p>
      )}
    </div>
  );
}
