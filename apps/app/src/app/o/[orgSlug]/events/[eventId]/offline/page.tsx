import { can } from "@evoly/core";
import { EmptyState } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/Controls";
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

export default async function EventOfflinePage({
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
  const conflicts = await optionConflicts(cashCtx, (await params).eventId); // RG-OPT-05
  const cashLocale = (await getLocale()) as Locale;
  // refonte A3 : l'état vide du tableau, sinon les conflits en rangées sous un titre de section (en rouge doux)
  if (conflicts.length === 0)
    return (
      <EmptyState title={(await getTranslations("nav"))("offlineEmpty")} />
    );
  return (
    <section aria-labelledby="conflicts-title">
      <SectionTitle id="conflicts-title" title={t("conflictsTitle")} />
      <p className="text-[13px] text-ink-muted">{t("conflictsHint")}</p>
      <ul role="list" className="mt-2">
        {conflicts.map((c) => (
          <li key={c.id} className="border-b border-line py-[9px]">
            <span className="text-ink-muted tabular-nums">
              {formatDateTime(
                c.happenedAt,
                event.timezone,
                cashLocale,
                "short",
              )}
            </span>{" "}
            ·{" "}
            <span className="text-danger">
              {t("conflictLine", {
                option: c.line.option.name,
                reference: c.line.order.reference,
                refused: c.refused,
                requested: c.requested,
              })}
            </span>
            {c.staffName ? ` · ${c.staffName}` : ""}
          </li>
        ))}
      </ul>
    </section>
  );
}
