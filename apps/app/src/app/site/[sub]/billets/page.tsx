import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { LookupForm } from "@/components/public/LookupForm";
import { PublicShell } from "@/components/public/PublicShell";
import { getPublicOrganization } from "@/server/publicEvents";
import { siteGate } from "@/server/siteGuard";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("orders");
  return { title: t("lookupTitle"), robots: { index: false, follow: false } };
}

/** US-POST-02 : retrouver ses billets avec son adresse e-mail. */
export default async function LookupPage({ params }: { params: Promise<{ sub: string }> }) {
  const { sub } = await params;
  if ((await siteGate(sub, "/billets")).kind === "DISABLED") notFound();
  const org = await getPublicOrganization(sub);
  if (!org) notFound();
  const t = await getTranslations("orders");
  return (
    <PublicShell org={org} homeHref="/">
      <div className="mx-auto grid max-w-xl gap-6 px-5 pt-6 pb-16 sm:px-8">
        <h1 className="font-display text-[clamp(2rem,6vw,3rem)] leading-[0.95] tracking-[-0.05em]">{t("lookupTitle")}</h1>
        <p className="text-ink-muted">{t("lookupIntro")}</p>
        <LookupForm sub={sub} />
      </div>
    </PublicShell>
  );
}
