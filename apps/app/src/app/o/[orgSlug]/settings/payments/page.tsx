import { can } from "@evoly/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ConnectStripe } from "@/app/onboarding/payments/ConnectStripe";
import { buttonClass } from "@/components/ui/Button";
import { Badge, Banner } from "@/components/ui/Card";
import { SettingsRow } from "@/components/ui/Controls";
import { stripe } from "@/lib/stripe";
import { findOrgContext, requireOrgContext } from "@/server/context";
import { refreshStripeAccount } from "@/server/stripeConnect";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("payments") };
}

export default async function PaymentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<{ stripe?: string }>;
}) {
  const { orgSlug } = await params;
  const { stripe: from } = await searchParams;
  let ctx = await requireOrgContext(orgSlug);
  if (from === "return" && ctx.stripe) {
    await refreshStripeAccount(ctx.organization.id);
    const fresh = await findOrgContext(ctx.user.id, orgSlug);
    if (fresh) ctx = { user: ctx.user, ...fresh };
  }
  const t = await getTranslations("settings");
  const status = ctx.stripe?.status ?? "NONE";
  const manage = can(ctx.membership, "PAYMENTS_MANAGE");
  const configured = !!stripe();
  const tone =
    status === "ACTIVE"
      ? "success"
      : status === "NONE"
        ? "neutral"
        : status === "PENDING"
          ? "warning"
          : "danger";
  // refonte A3 (maquette « Réglages de l'événement ») : l'explication, puis une rangée par sujet
  return (
    <div className="grid gap-3.5">
      <p className="max-w-[720px] text-[13px] text-ink-muted">
        {t("paymentsIntro")}
      </p>
      {!configured ? (
        <Banner tone="info" title={t("stripeNotConfiguredTitle")}>
          {t("stripeNotConfiguredBody")}
        </Banner>
      ) : null}
      <div>
        <SettingsRow title="Stripe" description={t(`stripeExplain_${status}`)}>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={tone} dot>
              {t(`stripeStatus_${status}`)}
            </Badge>
            {ctx.stripe && ctx.stripe.requirementsDue.length > 0 ? (
              <span className="text-[13px] text-ink-muted">
                {t("requirementsCount", {
                  count: ctx.stripe.requirementsDue.length,
                })}
              </span>
            ) : null}
          </div>
          {manage && configured ? (
            <div className="flex flex-wrap gap-2">
              {status !== "ACTIVE" ? (
                <ConnectStripe
                  orgSlug={ctx.organization.slug}
                  label={t(status === "NONE" ? "connect" : "finishSetup")}
                />
              ) : null}
              {ctx.stripe ? (
                <a
                  href="https://dashboard.stripe.com"
                  target="_blank"
                  rel="noreferrer"
                  className={buttonClass("secondary")}
                >
                  {t("openStripeDashboard")}
                </a>
              ) : null}
            </div>
          ) : null}
        </SettingsRow>
        <SettingsRow title={t("feesTitle")}>
          <p className="text-ink-body">
            {t(
              ctx.plan === "partner"
                ? "feesBodyPartner"
                : ctx.plan === "pro"
                  ? "feesBodyPro"
                  : "feesBodyFree",
            )}
          </p>
        </SettingsRow>
      </div>
    </div>
  );
}
