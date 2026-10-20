import type { Metadata } from "next";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { offerForVisitor, OFFER_COOKIE } from "@/server/promotions";
import { QuickStartForm } from "./QuickStartForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("quickstart");
  return { title: t("title") };
}

/** Visiteurs des annonces : l'événement d'abord, avec l'aperçu de leur billetterie ; le compte à la fin. */
export default async function StartPage() {
  const offer = await offerForVisitor((await cookies()).get(OFFER_COOKIE)?.value, await getLocale());
  return <QuickStartForm offer={offer?.banner ?? null} />;
}
