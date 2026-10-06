import { can } from "@evoly/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ConnectStripe } from "@/app/onboarding/payments/ConnectStripe";
import { buttonClass } from "@/components/ui/Button";
import { Badge, Banner, Card } from "@/components/ui/Card";
import { stripe } from "@/lib/stripe";
import { findOrgContext, requireOrgContext } from "@/server/context";
import { refreshStripeAccount } from "@/server/stripeConnect";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("settings");
  return { title: t("payments") };
}

export default async function PaymentsPage({ params, searchParams }: { params: Promise<{ orgSlug: string }>; searchParams: Promise<{ stripe?: string }> }) {
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
  return (
    <div className="grid gap-8">
      <header className="grid gap-2">
        <h1 className="page-title">{t("payments")}</h1>
        <p className="max-w-prose text-ink-muted">{t("paymentsIntro")}</p>
      </header>
      {!configured ? (
        <Banner tone="info" title={t("stripeNotConfiguredTitle")}>
          {t("stripeNotConfiguredBody")}
        </Banner>
      ) : null}
      <Card className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl tracking-[var(--tracking-title)]">Stripe</h2>
          <Badge tone={status === "ACTIVE" ? "success" : status === "NONE" ? "neutral" : status === "PENDING" ? "warning" : "danger"}>
            {t(`stripeStatus_${status}`)}
          </Badge>
        </div>
        <p className="text-[0.95rem]">{t(`stripeExplain_${status}`)}</p>
        {ctx.stripe && ctx.stripe.requirementsDue.length > 0 ? (
          <p className="text-sm text-ink-muted">{t("requirementsCount", { count: ctx.stripe.requirementsDue.length })}</p>
        ) : null}
        {manage && configured ? (
          <div className="flex flex-wrap gap-3">
            {status !== "ACTIVE" ? <ConnectStripe orgSlug={ctx.organization.slug} label={t(status === "NONE" ? "connect" : "finishSetup")} /> : null}
            {ctx.stripe ? (
              <a href="https://dashboard.stripe.com" target="_blank" rel="noreferrer" className={buttonClass("secondary", "lg")}>
                {t("openStripeDashboard")}
              </a>
            ) : null}
          </div>
        ) : null}
      </Card>
      <Card className="grid gap-3">
        <h2 className="font-display text-xl tracking-[var(--tracking-title)]">{t("feesTitle")}</h2>
        <p className="text-[0.95rem] text-ink-muted">{t(ctx.plan === "partner" ? "feesBodyPartner" : ctx.plan === "pro" ? "feesBodyPro" : "feesBodyFree")}</p>
      </Card>
    </div>
  );
}
