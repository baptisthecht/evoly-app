import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { requireOrgContext } from "@/server/context";
import { Steps } from "../Steps";
import { ConnectStripe } from "./ConnectStripe";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("paymentsTitle") };
}

export default async function OnboardingPaymentsPage({ searchParams }: { searchParams: Promise<{ org?: string }> }) {
  const { org } = await searchParams;
  if (!org) notFound();
  const ctx = await requireOrgContext(org);
  const t = await getTranslations("onboarding");
  // RG-AUTH-08 : venu du site par « ?plan=pro » → l'essai Pro est proposé juste après
  const wantsPro = (await cookies()).get("evoly_plan")?.value === "pro";
  return (
    <>
      <Steps current={2} />
      <header className="mb-8 grid gap-3">
        <h1 className="page-title">{t("paymentsTitle")}</h1>
        <p className="max-w-prose text-ink-muted">{t("paymentsBody")}</p>
      </header>
      <Card className="grid gap-5">
        <ul className="grid gap-3 text-[0.95rem]">
          {(["paymentsPoint1", "paymentsPoint2", "paymentsPoint3"] as const).map((k) => (
            <li key={k} className="flex gap-3">
              <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-accent ring-2 ring-ink" />
              {t(k)}
            </li>
          ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-2">
          <ConnectStripe orgSlug={ctx.organization.slug} />
          <ButtonLink href={wantsPro ? `/o/${ctx.organization.slug}/billing?essai=1` : `/o/${ctx.organization.slug}`} variant="secondary" size="lg">
            {t("paymentsLater")}
          </ButtonLink>
        </div>
        <p className="text-sm text-ink-muted">{t("paymentsLaterHint")}</p>
      </Card>
    </>
  );
}
