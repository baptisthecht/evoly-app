import { hasFeature, type PlanFeature } from "@evoly/core";
import { getTranslations } from "next-intl/server";
import { ButtonLink } from "./ui/Button";
import { EmptyState } from "./ui/Card";
import type { OrgContext } from "@/server/context";

/** Section pas encore livrée (développement), ou fonctionnalité Pro à découvrir. */
export async function ComingSoon({ ctx, section, feature }: { ctx: OrgContext; section: string; feature?: PlanFeature }) {
  const t = await getTranslations();
  const locked = feature && !hasFeature(ctx.features, feature);
  return (
    <div className="grid gap-8">
      <h1 className="page-title">{t(`nav.${section}`)}</h1>
      {locked ? (
        <EmptyState title={t("plans.proRequired")} action={<ButtonLink href={`/o/${ctx.organization.slug}/billing`}>{t("plans.startTrial")}</ButtonLink>}>
          {t(`upsell.${section}`)}
        </EmptyState>
      ) : (
        <EmptyState title={t("dashboard.comingSoonTitle")}>{t("dashboard.comingSoonBody")}</EmptyState>
      )}
    </div>
  );
}
