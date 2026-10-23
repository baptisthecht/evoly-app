import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SocialButtons } from "../SocialButtons";
import { redirectIfSignedIn } from "../redirectIfSignedIn";
import { RegisterForm } from "./RegisterForm";
import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { offerForVisitor, OFFER_COOKIE } from "@/server/promotions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth");
  return { title: t("registerTitle") };
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{
    plan?: string;
    email?: string;
    next?: string;
    offre?: string;
  }>;
}) {
  // offre de la campagne : dans l'adresse dès l'arrivée (le cookie du proxy n'existe qu'à partir de la page suivante)
  const offer = await offerForVisitor(
    (await searchParams).offre ?? (await cookies()).get(OFFER_COOKIE)?.value,
    await getLocale(),
  );
  const next =
    typeof (await searchParams).next === "string"
      ? ((await searchParams).next as string)
      : null;
  await redirectIfSignedIn();
  const t = await getTranslations("auth");
  const { plan, email } = await searchParams;
  return (
    <div className="grid gap-8">
      <header className="grid gap-3">
        <h1 className="page-title">{t("registerTitle")}</h1>
        {/* offre en cours (docs/OFFRES.md) : elle remplace l'essai de 14 jours ; sans offre, les textes habituels */}
        <p className="text-ink-muted">
          {offer
            ? offer.banner
            : plan === "pro"
              ? t("registerIntroPro")
              : t("registerIntro")}
        </p>
      </header>
      <SocialButtons next={next} />
      <RegisterForm email={email?.slice(0, 200)} />
    </div>
  );
}
