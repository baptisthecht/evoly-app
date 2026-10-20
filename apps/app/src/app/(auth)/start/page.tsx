import { launchOfferEnd } from "@evoly/core";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { QuickStartForm } from "./QuickStartForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("quickstart");
  return { title: t("title") };
}

/** Visiteurs des annonces : l'événement d'abord, le compte à la fin. */
export default async function StartPage() {
  const t = await getTranslations("quickstart");
  const offer = launchOfferEnd(new Date(), process.env.LAUNCH_OFFER_UNTIL) !== null;
  return (
    <div className="grid gap-6">
      <header className="grid gap-2">
        <h1 className="page-title">{t("title")}</h1>
        <p className="text-ink-muted">{t("lead")}</p>
        {offer ? <p className="text-sm font-semibold">{t("offer")}</p> : null}
      </header>
      <QuickStartForm />
    </div>
  );
}
