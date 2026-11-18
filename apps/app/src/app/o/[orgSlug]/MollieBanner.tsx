import { can } from "@evoly/core";
import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Card";
import { mollieState } from "@/lib/mollieState";
import type { OrgContext } from "@/server/context";

/** RG-ONB-03 et RG-FIN-02 : rappel tant que le compte Mollie de l'organisation n'est pas prêt à encaisser. */
export async function MollieBanner({ ctx }: { ctx: OrgContext }) {
  const state = mollieState(ctx.mollie);
  if (state === "ready" || !can(ctx.membership, "PAYMENTS_MANAGE")) return null;
  const t = await getTranslations("dashboard");
  const tm = await getTranslations("mollie");
  // informations à donner chez Mollie : à terminer ; vérification ou activation en cours : rien à faire, l'état suffit
  const key =
    state === "none"
      ? "mollieMissing"
      : state === "disconnected"
        ? "mollieAction"
        : state === "needsData"
          ? "molliePending"
          : "mollieReview";
  return (
    <Banner
      tone={state === "disconnected" ? "danger" : "warning"}
      title={t(`${key}Title`)}
      action={
        <ButtonLink
          className="shrink-0 whitespace-nowrap"
          href={`/o/${ctx.organization.slug}/settings/payments`}
          variant="dark"
          size="sm"
        >
          {t(`${key}Cta`)}
        </ButtonLink>
      }
    >
      {state === "none" ? t("mollieMissingBody") : tm(`explain_${state}`)}
    </Banner>
  );
}
