import { can } from "@evoly/core";
import { getTranslations } from "next-intl/server";
import { ButtonLink } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Card";
import type { OrgContext } from "@/server/context";

/** RG-ONB-03 et RG-FIN-02 : rappel tant que le compte Stripe n'est pas actif. */
export async function StripeBanner({ ctx }: { ctx: OrgContext }) {
  if (ctx.stripe?.status === "ACTIVE" || !can(ctx.membership, "PAYMENTS_MANAGE")) return null;
  const t = await getTranslations("dashboard");
  const key = !ctx.stripe ? "stripeMissing" : ctx.stripe.status === "PENDING" ? "stripePending" : "stripeRestricted";
  return (
    <Banner
      tone={ctx.stripe && ctx.stripe.status !== "PENDING" ? "danger" : "warning"}
      title={t(`${key}Title`)}
      action={
        <ButtonLink className="shrink-0 whitespace-nowrap" href={`/o/${ctx.organization.slug}/settings/payments`} variant="dark" size="sm">
          {t(`${key}Cta`)}
        </ButtonLink>
      }
    >
      {t(`${key}Body`)}
    </Banner>
  );
}
