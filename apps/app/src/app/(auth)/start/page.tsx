import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { offerForVisitor, OFFER_COOKIE } from "@/server/promotions";
import { QuickStartForm } from "./QuickStartForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("quickstart");
  return { title: t("title") };
}

/** Visiteurs des annonces : l'événement d'abord, le compte à la fin ; l'offre de leur campagne, s'il y en a une. */
export default async function StartPage() {
  const t = await getTranslations("quickstart");
  const offer = await offerForVisitor((await cookies()).get(OFFER_COOKIE)?.value, await getLocale());
  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <h1 className="page-title">{t("title")}</h1>
        <p className="text-ink-muted">{t("lead")}</p>
        {offer ? <p className="text-sm font-semibold">{offer.banner}</p> : null}
      </header>
      <QuickStartForm />
    </div>
  );
}
