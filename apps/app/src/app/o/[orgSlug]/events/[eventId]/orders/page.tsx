import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import OrdersPage from "../../../orders/page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nav");
  return { title: t("orders") };
}

/** Participants › Commandes : la liste des commandes de l'organisation, filtrée sur l'événement, sans quitter l'événement. */
export default async function EventOrdersPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgSlug: string; eventId: string }>;
  searchParams: Promise<{ q?: string; type?: string; filter?: string; page?: string }>;
}) {
  const { orgSlug, eventId } = await params;
  const sp = await searchParams;
  return <OrdersPage params={Promise.resolve({ orgSlug })} searchParams={Promise.resolve({ ...sp, event: eventId })} />;
}
