import { getSession } from "@/server/session";
import { autoJoinPendingInvitations } from "@/server/team";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { env } from "@/lib/env";
import { OrganizationForm } from "./OrganizationForm";
import { Steps } from "./Steps";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("onboarding");
  return { title: t("organizationTitle") };
}

export default async function OnboardingPage() {
  // RG-ORG-02 : invité sans compte, inscrit puis vérifié : il rejoint automatiquement l'organisation qui l'a invité
  const session = await getSession();
  if (session?.user && (await db.organizationMember.count({ where: { userId: session.user.id } })) === 0) {
    const joined = await autoJoinPendingInvitations(session.user.id);
    if (joined[0]) redirect(`/o/${joined[0]}`);
  }
  const t = await getTranslations("onboarding");
  const e = env();
  return (
    <>
      <Steps current={1} />
      <header className="mb-8 grid gap-3">
        <h1 className="page-title">{t("organizationTitle")}</h1>
        <p className="max-w-prose text-ink-muted">{t("organizationIntro")}</p>
      </header>
      <OrganizationForm baseDomain={e.NEXT_PUBLIC_BASE_DOMAIN} siteUrl={e.NEXT_PUBLIC_SITE_URL} />
    </>
  );
}
