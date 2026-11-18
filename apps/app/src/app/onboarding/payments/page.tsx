import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { Banner, Card } from "@/components/ui/Card";
import { effectivePlan } from "@evoly/core";
import { db } from "@/lib/db";
import { mollieConnectConfigured } from "@/lib/mollie";
import { requireOrgContext } from "@/server/context";
import { PLAN_SUBSCRIPTION_SELECT } from "@/server/planSelect";
import { Steps } from "../Steps";
import { ConnectMollie } from "./ConnectMollie";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("paymentsTitle") };
}

export default async function OnboardingPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; mollie?: string }>;
}) {
  const { org, mollie: result } = await searchParams;
  if (!org) notFound();
  const ctx = await requireOrgContext(org);
  const t = await getTranslations("onboarding");
  const tm = await getTranslations("mollie");
  const tf = await getTranslations("formErrors");
  const tc = await getTranslations("common");
  // RG-AUTH-08 : venu du site par « ?plan=pro » → l'essai Pro est proposé juste après
  const [sub, { phone }] = await Promise.all([
    db.subscription.findUnique({
      where: { organizationId: ctx.organization.id },
      select: PLAN_SUBSCRIPTION_SELECT,
    }),
    db.organization.findUniqueOrThrow({
      where: { id: ctx.organization.id },
      select: { phone: true },
    }),
  ]);
  // déjà en Pro (offre de lancement) ou en Partenaire : pas d'essai à proposer
  const wantsPro =
    (await cookies()).get("evoly_plan")?.value === "pro" &&
    effectivePlan(sub, new Date()) === "free";
  const next = wantsPro
    ? `/o/${ctx.organization.slug}/billing?essai=1`
    : `/o/${ctx.organization.slug}`;
  const linked = !!ctx.mollie && !ctx.mollie.disconnected;
  return (
    <>
      <Steps current={2} />
      <header className="mb-8 grid gap-3">
        <h1 className="page-title">{t("paymentsTitle")}</h1>
        <p className="max-w-prose text-ink-muted">{t("paymentsBody")}</p>
      </header>
      <Card className="grid gap-5">
        {result && result !== "connected" ? (
          <Banner
            tone={result === "denied" ? "info" : "danger"}
            title={
              result === "denied"
                ? tm("result_denied")
                : tf.has(result)
                  ? tf(result)
                  : tf("generic")
            }
          />
        ) : null}
        {linked ? (
          <>
            <Banner tone="success" title={tm("result_connected")}>
              {tm(
                ctx.mollie!.ready
                  ? "explain_ready"
                  : ctx.mollie!.onboardingStatus === "IN_REVIEW"
                    ? "explain_inReview"
                    : "explain_needsData",
              )}
            </Banner>
            <ButtonLink href={next} size="lg">
              {tc("continue")}
            </ButtonLink>
          </>
        ) : (
          <>
            <ul className="grid gap-3 text-[0.95rem]">
              {(
                ["paymentsPoint1", "paymentsPoint2", "paymentsPoint3"] as const
              ).map((k) => (
                <li key={k} className="flex gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-2 size-2 shrink-0 rounded-full bg-accent ring-2 ring-ink"
                  />
                  {t(k)}
                </li>
              ))}
            </ul>
            {mollieConnectConfigured() ? (
              <ConnectMollie
                orgSlug={ctx.organization.slug}
                from="onboarding"
                phone={phone}
              />
            ) : (
              <Banner tone="info" title={tm("notConfiguredTitle")}>
                {tm("notConfiguredBody")}
              </Banner>
            )}
            <ButtonLink href={next} variant="secondary" size="lg">
              {t("paymentsLater")}
            </ButtonLink>
            <p className="text-sm text-ink-muted">{t("paymentsLaterHint")}</p>
          </>
        )}
      </Card>
    </>
  );
}
